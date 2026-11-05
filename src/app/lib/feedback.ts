import {
  Prisma,
  FeedbackCategory,
  FeedbackSentiment,
  RecognitionCategory,
  RecognitionVisibility,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { UserContext } from "@/app/lib/access-control";
import { MAX_LONG_TEXT, resolveRatingBounds } from "@/app/lib/self-appraisal";
import { resolveActor } from "@/app/lib/manager-review";

// ---------------------------------------------------------------------------
// Fixed lists and rules
// ---------------------------------------------------------------------------
export const CORE_VALUES = [
  "Communication",
  "Teamwork",
  "Ownership",
  "Innovation",
  "Integrity",
] as const;
export const FOCUS_AREAS = [
  "Communication",
  "Leadership",
  "Collaboration",
  "Technical Skills",
  "Delivery & Quality",
] as const;
export const REPLY_EMOJIS = ["👍", "🙏", "🎉", "💡", "🚀"] as const;
export const RECOGNITION_POINTS = 250;
const MAX_TAGS = 5;
const MAX_REVIEWERS = 10;

export const enumOf = <T extends string>(
  values: readonly T[],
  v: unknown,
): v is T => typeof v === "string" && (values as readonly string[]).includes(v);
const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

// ---------------------------------------------------------------------------
// The signed-in employee (everything here is personal; HR/admin can also moderate)
// ---------------------------------------------------------------------------
export async function resolveSelf(user: UserContext, companyId: string) {
  const actor = await resolveActor(user, companyId);
  if (!actor.staffRecordId) return null;
  const me = await prisma.staffRecord.findFirst({
    where: { id: actor.staffRecordId, companyId },
    select: { id: true, managerId: true, departmentId: true },
  });
  return me ? { ...me, companyWide: actor.companyWide } : null;
}
export type Self = NonNullable<Awaited<ReturnType<typeof resolveSelf>>>;

export const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  avatarUrl: true,
  department: true, // legacy string
  departments: { select: { name: true } },
} satisfies Prisma.StaffRecordSelect;
type PersonRow = Prisma.StaffRecordGetPayload<{ select: typeof PERSON_SELECT }>;

export const toPerson = (p: PersonRow) => ({
  id: p.id,
  name: `${p.firstName} ${p.lastName}`.trim(),
  role: p.position,
  department: p.departments?.name ?? p.department ?? null,
  avatarUrl: p.avatarUrl,
});

// ---------------------------------------------------------------------------
// Feed items
// ---------------------------------------------------------------------------
export const feedbackSelect = (meId: string) =>
  ({
    id: true,
    authorId: true,
    recipientId: true,
    recognitionId: true,
    category: true,
    sentiment: true,
    content: true,
    tags: true,
    acknowledgedAt: true,
    createdAt: true,
    author: { select: PERSON_SELECT },
    _count: { select: { likes: true, comments: true } },
    likes: { where: { staffRecordId: meId }, select: { id: true } },
    bookmarks: { where: { staffRecordId: meId }, select: { id: true } },
  }) satisfies Prisma.FeedbackSelect;
export type FeedbackRow = Prisma.FeedbackGetPayload<{
  select: ReturnType<typeof feedbackSelect>;
}>;

export function serializeFeedback(f: FeedbackRow) {
  return {
    id: f.id,
    sender: toPerson(f.author),
    category: f.category,
    sentiment: f.sentiment,
    content: f.content,
    tags: f.tags,
    createdAt: f.createdAt,
    likes: f._count.likes,
    comments: f._count.comments,
    liked: f.likes.length > 0,
    bookmarked: f.bookmarks.length > 0,
    acknowledged: !!f.acknowledgedAt,
    fromRecognition: !!f.recognitionId,
  };
}

// The recipient and the author can see an item; HR / ADMIN / SUPER_ADMIN can moderate
export const canViewFeedback = (
  self: Self,
  f: { authorId: string; recipientId: string },
) => self.companyWide || f.authorId === self.id || f.recipientId === self.id;

// ---------------------------------------------------------------------------
// Recognitions
// ---------------------------------------------------------------------------
const RECOGNITION_STYLE: Record<
  RecognitionCategory,
  { iconKey: string; color: string }
> = {
  PERFORMANCE: { iconKey: "trophy", color: "#F59E0B" },
  LEADERSHIP: { iconKey: "award", color: "#8B5CF6" },
  COLLABORATION: { iconKey: "star", color: "#137FEC" },
  INNOVATION: { iconKey: "zap", color: "#10B981" },
};

export const recognitionSelect = {
  id: true,
  giverId: true,
  recipientId: true,
  category: true,
  title: true,
  message: true,
  coreValues: true,
  visibility: true,
  points: true,
  attachmentName: true,
  attachmentUrl: true,
  attachmentMime: true,
  attachmentSize: true,
  createdAt: true,
  giver: { select: PERSON_SELECT },
  recipient: { select: PERSON_SELECT },
  goal: { select: { id: true, title: true } },
  reactions: { select: { type: true, staffRecordId: true } },
} satisfies Prisma.RecognitionSelect;
export type RecognitionRow = Prisma.RecognitionGetPayload<{
  select: typeof recognitionSelect;
}>;

export function serializeRecognition(r: RecognitionRow, meId: string) {
  const likes = r.reactions.filter((x) => x.type === "LIKE");
  const celebrations = r.reactions.filter((x) => x.type === "CELEBRATE");
  return {
    id: r.id,
    title: r.title,
    type:
      r.giverId === meId ? "Given" : r.recipientId === meId ? "Received" : null,
    giver: toPerson(r.giver),
    recipient: toPerson(r.recipient),
    category: r.category,
    iconKey: RECOGNITION_STYLE[r.category].iconKey,
    color: RECOGNITION_STYLE[r.category].color,
    message: r.message,
    values: r.coreValues,
    visibility: r.visibility,
    points: r.points,
    attachment:
      r.attachmentName
        ? {
            name: r.attachmentName,
            url: r.attachmentUrl,
            mimeType: r.attachmentMime,
            sizeBytes: r.attachmentSize,
            downloadPath: `/api/recognitions/${r.id}/attachment/file`,
          }
        : null,
    goal: r.goal,
    createdAt: r.createdAt,
    likes: likes.length,
    celebrations: celebrations.length,
    liked: likes.some((x) => x.staffRecordId === meId),
    celebrated: celebrations.some((x) => x.staffRecordId === meId),
  };
}

// COMPANY: everyone. TEAM: the recipient's department. PRIVATE: giver and recipient only.
// HR / ADMIN / SUPER_ADMIN see everything (moderation).
export function recognitionVisibleWhere(
  self: Self,
): Prisma.RecognitionWhereInput {
  if (self.companyWide) return {};
  const or: Prisma.RecognitionWhereInput[] = [
    { giverId: self.id },
    { recipientId: self.id },
    { visibility: "COMPANY" },
  ];
  if (self.departmentId)
    or.push({ visibility: "TEAM", departmentId: self.departmentId });
  return { OR: or };
}

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------
function parseTags(raw: unknown): string[] | { error: string } {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return { error: "tags must be an array" };
  const tags = [
    ...new Set(
      raw.map((t) => clean(t).toLowerCase().replace(/^#/, "")).filter(Boolean),
    ),
  ];
  if (tags.length > MAX_TAGS)
    return { error: `At most ${MAX_TAGS} tags are allowed` };
  if (tags.some((t) => t.length > 30))
    return { error: "Each tag must be at most 30 characters" };
  return tags;
}

export function parseFeedbackPayload(body: any):
  | { error: string }
  | {
      recipientId: string;
      requestId: string | null;
      category: FeedbackCategory;
      sentiment: FeedbackSentiment;
      content: string;
      tags: string[];
    } {
  if (typeof body?.recipientId !== "string" || !body.recipientId)
    return { error: "recipientId is required" };
  if (!enumOf(Object.values(FeedbackCategory), body?.category))
    return {
      error: `category must be one of: ${Object.values(FeedbackCategory).join(", ")}`,
    };
  if (!enumOf(Object.values(FeedbackSentiment), body?.sentiment))
    return {
      error: `sentiment must be one of: ${Object.values(FeedbackSentiment).join(", ")}`,
    };
  const content = clean(body?.content);
  if (!content) return { error: "content is required" };
  if (content.length > MAX_LONG_TEXT)
    return { error: `content must be at most ${MAX_LONG_TEXT} characters` };
  const tags = parseTags(body?.tags);
  if (!Array.isArray(tags)) return tags;
  return {
    recipientId: body.recipientId,
    requestId: typeof body?.requestId === "string" ? body.requestId : null,
    category: body.category,
    sentiment: body.sentiment,
    content,
    tags,
  };
}

export function parseRecognitionPayload(body: any):
  | { error: string }
  | {
      recipientId: string;
      category: RecognitionCategory;
      message: string;
      coreValues: string[];
      visibility: RecognitionVisibility;
      goalId: string | null;
      attachment: { fileName: string; fileUrl: string } | null;
    } {
  if (typeof body?.recipientId !== "string" || !body.recipientId)
    return { error: "recipientId is required" };
  if (!enumOf(Object.values(RecognitionCategory), body?.category))
    return {
      error: `category must be one of: ${Object.values(RecognitionCategory).join(", ")}`,
    };
  const message = clean(body?.message);
  if (!message) return { error: "A recognition message is required" };
  if (message.length > MAX_LONG_TEXT)
    return { error: `message must be at most ${MAX_LONG_TEXT} characters` };

  const raw = body?.coreValues ?? [];
  if (!Array.isArray(raw)) return { error: "coreValues must be an array" };
  const coreValues = [...new Set(raw)];
  if (!coreValues.every((v) => enumOf(CORE_VALUES, v)))
    return { error: `coreValues must be from: ${CORE_VALUES.join(", ")}` };

  const visibility = body?.visibility ?? "COMPANY";
  if (!enumOf(Object.values(RecognitionVisibility), visibility))
    return {
      error: `visibility must be one of: ${Object.values(RecognitionVisibility).join(", ")}`,
    };

  let attachment: { fileName: string; fileUrl: string } | null = null;
  if (body?.attachment) {
    const fileName = clean(body.attachment.fileName);
    const fileUrl = clean(body.attachment.fileUrl);
    if (!fileName || fileName.length > 255 || !fileUrl)
      return {
        error: "attachment needs a fileName (max 255 characters) and a fileUrl",
      };
    attachment = { fileName, fileUrl };
  }

  return {
    recipientId: body.recipientId,
    category: body.category,
    message,
    coreValues: coreValues as string[],
    visibility,
    goalId:
      typeof body?.goalId === "string" && body.goalId ? body.goalId : null,
    attachment,
  };
}

export function parseRequestPayload(
  body: any,
):
  | { error: string }
  | { reviewerIds: string[]; focusAreas: string[]; message: string | null } {
  const ids = body?.reviewerIds;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((i) => typeof i === "string")
  )
    return { error: "reviewerIds must be a non-empty array of ids" };
  const reviewerIds = [...new Set(ids as string[])];
  if (reviewerIds.length > MAX_REVIEWERS)
    return { error: `You can ask at most ${MAX_REVIEWERS} people at once` };

  const raw = body?.focusAreas ?? [];
  if (!Array.isArray(raw) || !raw.every((f) => enumOf(FOCUS_AREAS, f)))
    return { error: `focusAreas must be from: ${FOCUS_AREAS.join(", ")}` };
  const message = clean(body?.message);
  if (message.length > MAX_LONG_TEXT)
    return { error: `message must be at most ${MAX_LONG_TEXT} characters` };
  return {
    reviewerIds,
    focusAreas: [...new Set(raw as string[])],
    message: message || null,
  };
}

// Files come from POST /api/goals/uploads, so only that company's folder is accepted
export const validAttachmentUrl = (companyId: string, url: string) =>
  url.startsWith(`/goal-evidence/${companyId}/`) && !url.includes("..");

// ---------------------------------------------------------------------------
// Hero figures (calendar quarter vs the previous one)
// ---------------------------------------------------------------------------
function periodBounds(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const q = Math.floor(m / 3) * 3;
  return {
    qStart: new Date(Date.UTC(y, q, 1)),
    qEnd: new Date(Date.UTC(y, q + 3, 1)),
    prevStart: new Date(Date.UTC(y, q - 3, 1)),
    monthStart: new Date(Date.UTC(y, m, 1)),
  };
}

export async function buildHero(self: Self, companyId: string) {
  const { qStart, qEnd, prevStart, monthStart } = periodBounds();

  const [received, pendingCount, recs, reviews, activeStaff, quarterCounts] =
    await Promise.all([
      prisma.feedback.findMany({
        where: { companyId, recipientId: self.id },
        select: {
          authorId: true,
          sentiment: true,
          createdAt: true,
          acknowledgedAt: true,
        },
      }),
      prisma.feedbackRequest.count({
        where: { companyId, requesterId: self.id, status: "PENDING" },
      }),
      prisma.recognition.findMany({
        where: { companyId, recipientId: self.id },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          coreValues: true,
          giver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      prisma.managerReview.findMany({
        where: { companyId, staffRecordId: self.id, status: "SUBMITTED" },
        orderBy: { submittedAt: "desc" },
        take: 6,
        select: {
          overallScore: true,
          calibratedOverallScore: true,
          competencyRatings: {
            select: {
              competencyId: true,
              competencyName: true,
              rating: true,
              calibratedRating: true,
            },
          },
        },
      }),
      prisma.staffRecord.count({ where: { companyId, isActive: true } }),
      prisma.recognition.groupBy({
        by: ["recipientId"],
        where: { companyId, createdAt: { gte: qStart, lt: qEnd } },
        _count: { _all: true },
      }),
    ]);

  // Sentiment: positive share of feedback that has a sentiment
  const inRange = (d: Date, a: Date, b: Date) => d >= a && d < b;
  const positiveShare = (rows: typeof received) => {
    const rated = rows.filter((r) => r.sentiment !== null);
    return rated.length
      ? Math.round(
          (rated.filter((r) => r.sentiment === "POSITIVE").length /
            rated.length) *
            100,
        )
      : null;
  };
  const sentimentScore = positiveShare(
    received.filter((f) => inRange(f.createdAt, qStart, qEnd)),
  );
  const prevScore = positiveShare(
    received.filter((f) => inRange(f.createdAt, prevStart, qStart)),
  );

  // Recognitions
  const seen = new Set<string>();
  const recentRecognizers: { name: string; avatarUrl: string | null }[] = [];
  for (const r of recs) {
    if (seen.has(r.giver.id)) continue;
    seen.add(r.giver.id);
    recentRecognizers.push({
      name: `${r.giver.firstName} ${r.giver.lastName}`.trim(),
      avatarUrl: r.giver.avatarUrl,
    });
    if (recentRecognizers.length === 4) break;
  }
  const tally = new Map<string, number>();
  for (const r of recs)
    for (const v of r.coreValues) tally.set(v, (tally.get(v) ?? 0) + 1);
  const topRecognizedTag =
    [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Recognition score: percentile among active staff by recognitions received this quarter
  const mine = recs.filter((r) => inRange(r.createdAt, qStart, qEnd)).length;
  const recognitionScore =
    mine === 0 || activeStaff <= 1
      ? null
      : Math.round(
          ((activeStaff -
            quarterCounts.filter((q) => q._count._all >= mine).length) /
            activeStaff) *
            100,
        );

  // Growth readiness comes from submitted manager reviews (calibrated score if present)
  const finalScore = (r: {
    calibratedOverallScore: number | null;
    overallScore: number | null;
  }) => r.calibratedOverallScore ?? r.overallScore;
  const latest = reviews[0];
  const latestScore = latest ? finalScore(latest) : null;
  const growthTrend = [...reviews]
    .reverse()
    .map(finalScore)
    .filter((s): s is number => s !== null)
    .map((s) => ({ score: Math.round(s) }));

  let strongCompetency: string | null = null;
  let focusCompetency: string | null = null;
  if (latest) {
    const rated = latest.competencyRatings
      .map((c) => ({ ...c, effective: c.calibratedRating ?? c.rating }))
      .filter((c) => c.effective !== null);
    if (rated.length) {
      const bounds = await resolveRatingBounds(
        companyId,
        rated.map((c) => c.competencyId),
      );
      const scored = rated
        .map((c) => ({
          name: c.competencyName,
          pct:
            ((c.effective as number) / (bounds.get(c.competencyId)?.max ?? 5)) *
            100,
        }))
        .sort((a, b) => b.pct - a.pct);
      strongCompetency = scored[0].name;
      if (scored.length > 1) focusCompetency = scored[scored.length - 1].name;
    }
  }

  return {
    sentimentScore,
    sentimentDelta:
      sentimentScore !== null && prevScore !== null
        ? sentimentScore - prevScore
        : null,
    positivePercent: sentimentScore,
    constructivePercent: sentimentScore === null ? null : 100 - sentimentScore,
    sentimentHighlight: null, // mocked AI text, not generated
    totalRecognitions: recs.length,
    kudosCount: recs.length, // header badge, same total
    monthDelta: recs.filter((r) => r.createdAt >= monthStart).length,
    recentRecognizers,
    topRecognizedTag,
    recognitionScore,
    totalFeedbacks: received.length,
    peerFeedbacks: received.filter(
      (f) => !self.managerId || f.authorId !== self.managerId,
    ).length,
    managerFeedbacks: received.filter(
      (f) => !!self.managerId && f.authorId === self.managerId,
    ).length,
    unreadCount: received.filter((f) => !f.acknowledgedAt).length,
    pendingCount,
    growthReadinessScore: latestScore === null ? null : Math.round(latestScore),
    growthTrend,
    strongCompetency,
    focusCompetency,
  };
}

// ---------------------------------------------------------------------------
// Analytics (monthly buckets)
// ---------------------------------------------------------------------------
export type AnalyticsRange = "12m" | "6m" | "ytd";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export async function buildAnalytics(
  self: Self,
  companyId: string,
  range: AnalyticsRange,
) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start =
    range === "12m"
      ? new Date(Date.UTC(y, m - 11, 1))
      : range === "6m"
        ? new Date(Date.UTC(y, m - 5, 1))
        : new Date(Date.UTC(y, 0, 1));
  const startIdx = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const nowIdx = y * 12 + m;
  const idxOf = (d: Date) =>
    d.getUTCFullYear() * 12 + d.getUTCMonth() - startIdx;

  const buckets = Array.from({ length: nowIdx - startIdx + 1 }, (_, i) => ({
    name: MONTHS[(startIdx + i) % 12],
    positive: 0,
    rated: 0,
    manager: 0,
  }));

  const [feedback, recs] = await Promise.all([
    prisma.feedback.findMany({
      where: { companyId, recipientId: self.id, createdAt: { gte: start } },
      select: { createdAt: true, sentiment: true, authorId: true },
    }),
    prisma.recognition.findMany({
      where: { companyId, recipientId: self.id, createdAt: { gte: start } },
      select: { coreValues: true },
    }),
  ]);

  for (const f of feedback) {
    const b = buckets[idxOf(f.createdAt)];
    if (!b) continue;
    if (f.sentiment) {
      b.rated += 1;
      if (f.sentiment === "POSITIVE") b.positive += 1;
    }
    if (self.managerId && f.authorId === self.managerId) b.manager += 1;
  }

  const counts = new Map<string, number>();
  for (const r of recs)
    for (const v of r.coreValues) counts.set(v, (counts.get(v) ?? 0) + 1);
  const anyValues = [...counts.values()].some((n) => n > 0);

  return {
    range,
    // sentiment is a percentage (null = no rated feedback that month); manager is a count
    trendData: buckets.map((b) => ({
      name: b.name,
      sentiment: b.rated ? Math.round((b.positive / b.rated) * 100) : null,
      manager: b.manager,
    })),
    // recognitions received per core value; empty when there are none
    competencyData: anyValues
      ? CORE_VALUES.map((v) => ({ subject: v, A: counts.get(v) ?? 0 }))
      : [],
    aiInsight: null, // mocked AI text, not generated
  };
}
