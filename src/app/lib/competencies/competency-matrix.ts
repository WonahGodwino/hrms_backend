import { prisma } from "@/app/lib/db";
import { CompetencyStatus } from "@prisma/client";
import {
  logCompetencyAction,
  resolveScaleForCompetency,
} from "./competency-utils";

const ACTIVE = { equals: "Active", mode: "insensitive" as const };

export async function getCompetencyMatrix(
  companyId: string,
  opts: { includeDrafts?: boolean; departmentId?: string } = {},
) {
  const statuses: CompetencyStatus[] = opts.includeDrafts
    ? ["ACTIVE", "DRAFT"]
    : ["ACTIVE"];

  const [scales, competencies, departments, designations] = await Promise.all([
    prisma.proficiencyScale.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        isDefault: true,
        levels: {
          orderBy: { displayOrder: "asc" },
          select: { level: true, name: true },
        },
      },
    }),
    prisma.competency.findMany({
      where: { companyId, status: { in: statuses } },
      select: {
        id: true,
        name: true,
        category: true,
        customCategory: true,
        status: true,
        scaleId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: {
        companyId,
        status: ACTIVE,
        ...(opts.departmentId ? { id: opts.departmentId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.designation.findMany({
      where: {
        companyId,
        status: ACTIVE,
        ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
      },
      select: { id: true, title: true, departmentId: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const competencyIds = competencies.map((c) => c.id);
  const designationIds = designations.map((d) => d.id);

  const [designationMappings, departmentMappings] = await Promise.all([
    prisma.competencyRoleMapping.findMany({
      where: {
        competencyId: { in: competencyIds },
        designationId: { in: designationIds },
      },
      select: { competencyId: true, designationId: true, requiredLevel: true },
    }),
    prisma.competencyDepartmentMapping.findMany({
      where: {
        competencyId: { in: competencyIds },
        departmentId: { in: departments.map((d) => d.id) },
      },
      select: { competencyId: true, departmentId: true, requiredLevel: true },
    }),
  ]);

  // Resolve each competency's effective scale (own override, else company default)
  const defaultScaleId = scales.find((s) => s.isDefault)?.id ?? null;

  // Group designations under active departments; the rest go under "Unassigned"
  const deptIds = new Set(departments.map((d) => d.id));
  const groups: {
    id: string | null;
    name: string;
    designations: { id: string; title: string }[];
  }[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    designations: designations
      .filter((x) => x.departmentId === d.id)
      .map(({ id, title }) => ({ id, title })),
  }));

  const unassigned = designations.filter(
    (x) => !x.departmentId || !deptIds.has(x.departmentId),
  );
  if (!opts.departmentId && unassigned.length > 0) {
    groups.push({
      id: null,
      name: "Unassigned",
      designations: unassigned.map(({ id, title }) => ({ id, title })),
    });
  }

  return {
    scales,
    competencies: competencies.map((c) => ({
      ...c,
      scaleId: c.scaleId ?? defaultScaleId,
    })),
    departments: groups,
    designationMappings, // sparse: only mapped cells
    departmentMappings, // sparse: only mapped cells
  };
}

const MAX_CHANGES = 500;

export class MatrixError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type NormalizedChange = {
  competencyId: string;
  designationId?: string;
  departmentId?: string;
  action: "set" | "clear";
  requiredLevel: number | null;
  // undefined = skip the conflict check, null = "no mapping existed when loaded"
  before: undefined | null | { requiredLevel: number | null };
};

type Op = {
  target: "designation" | "department";
  targetId: string;
  from: "none" | number | null;
  to: "removed" | number | null;
};

const cellKey = (c: {
  competencyId: string;
  designationId?: string;
  departmentId?: string;
}) => `${c.competencyId}|${c.designationId ?? ""}|${c.departmentId ?? ""}`;

export async function applyMatrixChanges(args: {
  companyId: string;
  actorId: string;
  changes: any[];
}) {
  const { companyId, actorId } = args;

  if (!Array.isArray(args.changes) || args.changes.length === 0) {
    throw new MatrixError("changes must be a non-empty array");
  }
  if (args.changes.length > MAX_CHANGES) {
    throw new MatrixError(
      `Too many changes in one request (max ${MAX_CHANGES})`,
    );
  }

  // 1. Normalize; if a cell appears twice the last change wins
  const byCell = new Map<string, NormalizedChange>();
  for (const raw of args.changes) {
    const competencyId = raw?.competencyId;
    let designationId = raw?.designationId || undefined;
    let departmentId = raw?.departmentId || undefined;

    if (typeof competencyId !== "string" || !competencyId) {
      throw new MatrixError("Each change needs a competencyId");
    }
    // If client passes both designationId and departmentId (e.g. designation inside a department),
    // designation is the more specific mapping target, so ignore the redundant departmentId.
    if (designationId && departmentId) {
      departmentId = undefined;
    }
    if (!designationId && !departmentId) {
      throw new MatrixError(
        "Each change needs exactly one of designationId or departmentId",
      );
    }
    if (raw.action !== "set" && raw.action !== "clear") {
      throw new MatrixError('action must be "set" or "clear"');
    }

    let requiredLevel: number | null = null;
    if (
      raw.action === "set" &&
      raw.requiredLevel !== undefined &&
      raw.requiredLevel !== null &&
      raw.requiredLevel !== ""
    ) {
      const n = Number(raw.requiredLevel);
      if (!Number.isInteger(n) || n < 1) {
        throw new MatrixError("requiredLevel must be a positive integer");
      }
      requiredLevel = n;
    }

    const before =
      raw.before === undefined
        ? undefined
        : raw.before === null
          ? null
          : { requiredLevel: raw.before.requiredLevel ?? null };

    const change: NormalizedChange = {
      competencyId,
      designationId,
      departmentId,
      action: raw.action,
      requiredLevel,
      before,
    };
    byCell.set(cellKey(change), change);
  }
  const changes = [...byCell.values()];

  return prisma.$transaction(
    async (tx) => {
      const compIds = [...new Set(changes.map((c) => c.competencyId))];
      const desigIds = [
        ...new Set(
          changes.map((c) => c.designationId).filter((x): x is string => !!x),
        ),
      ];
      const deptIds = [
        ...new Set(
          changes.map((c) => c.departmentId).filter((x): x is string => !!x),
        ),
      ];

      // 2. Everything referenced must exist, belong to this company, and be editable
      const [competencies, designationCount, departmentCount] =
        await Promise.all([
          tx.competency.findMany({
            where: { id: { in: compIds }, companyId },
            select: {
              id: true,
              name: true,
              companyId: true,
              scaleId: true,
              status: true,
            },
          }),
          tx.designation.count({ where: { id: { in: desigIds }, companyId } }),
          tx.department.count({ where: { id: { in: deptIds }, companyId } }),
        ]);

      if (competencies.length !== compIds.length) {
        throw new MatrixError(
          "One or more competencies are invalid for this company",
        );
      }
      const archived = competencies.find((c) => c.status === "ARCHIVED");
      if (archived) {
        throw new MatrixError(
          `Cannot edit mappings of archived competency "${archived.name}"`,
        );
      }
      if (designationCount !== desigIds.length) {
        throw new MatrixError(
          "One or more designations are invalid for this company",
        );
      }
      if (departmentCount !== deptIds.length) {
        throw new MatrixError(
          "One or more departments are invalid for this company",
        );
      }

      // 3. Validate levels against each competency's own scale
      const compById = new Map(competencies.map((c) => [c.id, c]));
      const allowedCache = new Map<
        string,
        { name: string; levels: Set<number> } | null
      >();
      for (const ch of changes) {
        if (ch.action !== "set" || ch.requiredLevel === null) continue;
        let allowed = allowedCache.get(ch.competencyId);
        if (allowed === undefined) {
          const scale = await resolveScaleForCompetency(
            tx,
            compById.get(ch.competencyId)!,
          );
          allowed = scale
            ? {
                name: scale.name,
                levels: new Set(scale.levels.map((l) => l.level)),
              }
            : null;
          allowedCache.set(ch.competencyId, allowed);
        }
        if (allowed && !allowed.levels.has(ch.requiredLevel)) {
          throw new MatrixError(
            `requiredLevel ${ch.requiredLevel} is not a level in the "${allowed.name}" scale (competency "${compById.get(ch.competencyId)!.name}")`,
          );
        }
      }

      // 4. Load the current state of every touched cell
      const [roleRows, deptRows] = await Promise.all([
        tx.competencyRoleMapping.findMany({
          where: {
            competencyId: { in: compIds },
            designationId: { in: desigIds },
          },
          select: {
            id: true,
            competencyId: true,
            designationId: true,
            requiredLevel: true,
          },
        }),
        tx.competencyDepartmentMapping.findMany({
          where: {
            competencyId: { in: compIds },
            departmentId: { in: deptIds },
          },
          select: {
            id: true,
            competencyId: true,
            departmentId: true,
            requiredLevel: true,
          },
        }),
      ]);
      const roleExisting = new Map(
        roleRows.map((r) => [`${r.competencyId}|${r.designationId}`, r]),
      );
      const deptExisting = new Map(
        deptRows.map((r) => [`${r.competencyId}|${r.departmentId}`, r]),
      );
      const existingFor = (c: NormalizedChange) =>
        c.designationId
          ? roleExisting.get(`${c.competencyId}|${c.designationId}`)
          : deptExisting.get(`${c.competencyId}|${c.departmentId}`);

      // 5. Conflict check: has anyone changed these cells since the client loaded them?
      const conflicts = changes
        .filter((c) => {
          if (c.before === undefined) return false;
          const cur = existingFor(c);
          if (c.before === null) return !!cur;
          return !cur || cur.requiredLevel !== c.before.requiredLevel;
        })
        .map((c) => ({
          competencyId: c.competencyId,
          designationId: c.designationId ?? null,
          departmentId: c.departmentId ?? null,
        }));
      if (conflicts.length > 0) {
        throw new MatrixError(
          "Some mappings changed since you loaded the matrix",
          409,
          {
            conflicts,
          },
        );
      }

      // 6. Plan the writes
      const roleCreate: {
        competencyId: string;
        designationId: string;
        requiredLevel: number | null;
      }[] = [];
      const deptCreate: {
        competencyId: string;
        departmentId: string;
        requiredLevel: number | null;
      }[] = [];
      const roleUpdate = new Map<number | null, string[]>();
      const deptUpdate = new Map<number | null, string[]>();
      const roleDelete: string[] = [];
      const deptDelete: string[] = [];
      const opsByCompetency = new Map<string, Op[]>();

      const pushOp = (competencyId: string, op: Op) => {
        if (!opsByCompetency.has(competencyId))
          opsByCompetency.set(competencyId, []);
        opsByCompetency.get(competencyId)!.push(op);
      };
      const group = (
        m: Map<number | null, string[]>,
        level: number | null,
        id: string,
      ) => {
        if (!m.has(level)) m.set(level, []);
        m.get(level)!.push(id);
      };

      for (const c of changes) {
        const cur = existingFor(c);
        const isRole = !!c.designationId;
        const target = isRole ? "designation" : "department";
        const targetId = (c.designationId ?? c.departmentId)!;

        if (c.action === "clear") {
          if (!cur) continue; // nothing to remove
          (isRole ? roleDelete : deptDelete).push(cur.id);
          pushOp(c.competencyId, {
            target,
            targetId,
            from: cur.requiredLevel,
            to: "removed",
          });
        } else if (!cur) {
          if (isRole) {
            roleCreate.push({
              competencyId: c.competencyId,
              designationId: targetId,
              requiredLevel: c.requiredLevel,
            });
          } else {
            deptCreate.push({
              competencyId: c.competencyId,
              departmentId: targetId,
              requiredLevel: c.requiredLevel,
            });
          }
          pushOp(c.competencyId, {
            target,
            targetId,
            from: "none",
            to: c.requiredLevel,
          });
        } else if (cur.requiredLevel !== c.requiredLevel) {
          group(isRole ? roleUpdate : deptUpdate, c.requiredLevel, cur.id);
          pushOp(c.competencyId, {
            target,
            targetId,
            from: cur.requiredLevel,
            to: c.requiredLevel,
          });
        }
        // else: already in the requested state, no-op
      }

      // 7. Apply (batched: one query per operation type, not per cell)
      if (roleCreate.length) {
        await tx.competencyRoleMapping.createMany({
          data: roleCreate,
          skipDuplicates: true,
        });
      }
      for (const [level, ids] of roleUpdate) {
        await tx.competencyRoleMapping.updateMany({
          where: { id: { in: ids } },
          data: { requiredLevel: level },
        });
      }
      if (roleDelete.length) {
        await tx.competencyRoleMapping.deleteMany({
          where: { id: { in: roleDelete } },
        });
      }

      if (deptCreate.length) {
        await tx.competencyDepartmentMapping.createMany({
          data: deptCreate,
          skipDuplicates: true,
        });
      }
      for (const [level, ids] of deptUpdate) {
        await tx.competencyDepartmentMapping.updateMany({
          where: { id: { in: ids } },
          data: { requiredLevel: level },
        });
      }
      if (deptDelete.length) {
        await tx.competencyDepartmentMapping.deleteMany({
          where: { id: { in: deptDelete } },
        });
      }

      // 8. One history entry per affected competency
      let applied = 0;
      for (const [competencyId, ops] of opsByCompetency) {
        applied += ops.length;
        await logCompetencyAction(tx, {
          competencyId,
          companyId,
          action: "MATRIX_UPDATED",
          actorId,
          newData: { changes: ops },
        });
      }

      return {
        applied,
        created: roleCreate.length + deptCreate.length,
        updated: [...roleUpdate.values(), ...deptUpdate.values()].reduce(
          (n, a) => n + a.length,
          0,
        ),
        removed: roleDelete.length + deptDelete.length,
        unchanged: changes.length - applied,
      };
    },
    { timeout: 20000 },
  );
}