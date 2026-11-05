// src/app/api/admin/staff/duplicate-names/route.ts
// Detect staff members with duplicate/similar names in the same company
// Used by Staff Management to flag potential data quality issues

import { NextRequest } from 'next/server';
import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * Normalize a name for comparison:
 * - lowercase
 * - trim whitespace
 * - collapse multiple spaces
 * - remove common prefixes/suffixes (Mr, Mrs, Dr, etc.)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(mr|mrs|ms|dr|prof|eng|hon)\.?\s+/i, '')
    .replace(/\s+(jr|sr|ii|iii|iv)\.?\s*$/i, '')
    .replace(/[^a-z\s]/g, '') // remove non-alpha characters
    .trim();
}

/**
 * Calculate similarity between two strings using Levenshtein distance.
 * Returns a value between 0 (identical) and 1 (completely different).
 */
function nameSimilarity(a: string, b: string): number {
  if (a === b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length] / maxLen;
}

/**
 * GET /api/admin/staff/duplicate-names?companyId=X&threshold=0.85
 *
 * Detects staff with duplicate or very similar names.
 * - threshold: similarity threshold (0-1, default 0.85)
 * - Returns groups of staff with matching/similar names
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin);
    }

    const token = authHeader.replace('Bearer ', '');
    requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const threshold = parseFloat(searchParams.get('threshold') || '0.85');

    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin);
    }

    // Fetch all staff for this company
    const staff = await prisma.staffRecord.findMany({
      where: { companyId },
      select: {
        id: true,
        staffId: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        position: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Normalize all names
    const staffWithNormalized = staff.map((s) => ({
      ...s,
      normalizedFirst: normalizeName(s.firstName || ''),
      normalizedLast: normalizeName(s.lastName || ''),
      fullName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
      normalizedFull: normalizeName(`${s.firstName || ''} ${s.lastName || ''}`),
    }));

    // Group by exact matches first (normalized full name)
    const exactGroups: Record<string, typeof staffWithNormalized> = {};
    for (const s of staffWithNormalized) {
      const key = s.normalizedFull;
      if (!key) continue; // skip empty names
      if (!exactGroups[key]) exactGroups[key] = [];
      exactGroups[key].push(s);
    }

    // Also find similar names using fuzzy matching
    const similarGroups: Array<{
      matchType: 'exact' | 'similar';
      similarity: number;
      matchedName: string;
      staff: typeof staffWithNormalized;
    }> = [];

    // Exact matches
    for (const [name, members] of Object.entries(exactGroups)) {
      if (members.length > 1) {
        similarGroups.push({
          matchType: 'exact',
          similarity: 1,
          matchedName: name,
          staff: members,
        });
      }
    }

    // Fuzzy matches (only check names not already in exact groups)
    const processedPairs = new Set<string>();
    for (let i = 0; i < staffWithNormalized.length; i++) {
      for (let j = i + 1; j < staffWithNormalized.length; j++) {
        const a = staffWithNormalized[i];
        const b = staffWithNormalized[j];
        const pairKey = [a.id, b.id].sort().join('-');

        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        // Skip if already in an exact group
        const aInExact = exactGroups[a.normalizedFull]?.length > 1;
        const bInExact = exactGroups[b.normalizedFull]?.length > 1;
        if (aInExact && bInExact) continue;

        // Check last name similarity
        const lastNameSim = nameSimilarity(a.normalizedLast, b.normalizedLast);
        // Check first name similarity
        const firstNameSim = nameSimilarity(a.normalizedFirst, b.normalizedFirst);
        // Combined: weighted average (last name matters more)
        const combinedSim = lastNameSim * 0.6 + firstNameSim * 0.4;

        if (combinedSim <= (1 - threshold) && lastNameSim <= 0.15) {
          // Last names are very similar AND first names are somewhat similar
          similarGroups.push({
            matchType: 'similar',
            similarity: 1 - combinedSim,
            matchedName: `${a.fullName} ↔ ${b.fullName}`,
            staff: [a, b],
          });
        }
      }
    }

    // Sort by similarity (most similar first)
    similarGroups.sort((a, b) => b.similarity - a.similarity);

    const totalDuplicateStaff = new Set(
      similarGroups.flatMap((g) => g.staff.map((s) => s.id))
    ).size;

    return withCors(
      ApiResponse.success(
        {
          duplicateGroups: similarGroups,
          summary: {
            totalGroups: similarGroups.length,
            totalDuplicateStaff,
            exactMatches: similarGroups.filter((g) => g.matchType === 'exact').length,
            similarMatches: similarGroups.filter((g) => g.matchType === 'similar').length,
          },
        },
        similarGroups.length > 0
          ? `Found ${similarGroups.length} group(s) with ${totalDuplicateStaff} staff member(s) having duplicate/similar names`
          : 'No duplicate names found'
      ),
      origin
    );
  } catch (error) {
    console.error('[STAFF_DUPLICATE_NAMES] Error:', error);
    return withCors(handleApiError(error), origin);
  }
}
