import { estimatedBonusPoints } from "@/lib/rewards";
import { safeDateTimeMs } from "@/lib/week-utils";

export type SettlementHistoryRow = {
  id: string;
  week_start: string;
  bonus_points: number;
  created_at: string;
};

export type PostBreakdown = {
  id: string;
  contentPreview: string;
  activityName: string;
  viewCount: number;
  syncCount: number;
  syncPoints: number;
  viewPoints: number;
  bonusTotal: number;
  created_at: string;
};

export function buildPostBreakdown(
  log: {
    id: string;
    content: string | null;
    view_count?: number | null;
    created_at: string;
    activity_types: { name: string | null } | null;
  },
  syncCount: number
): PostBreakdown {
  const views =
    typeof log.view_count === "number" && !Number.isNaN(log.view_count)
      ? Math.max(0, Math.floor(log.view_count))
      : 0;
  const sync = Math.max(0, Math.floor(syncCount));
  const syncPoints = sync * 5;
  const viewPoints = Math.floor(views / 10);
  const bonusTotal = estimatedBonusPoints(sync, views);
  const raw = log.content?.trim() ?? "";
  const contentPreview =
    raw.length > 120 ? `${raw.slice(0, 120)}…` : raw || "내용 없음";

  const at = log.activity_types;
  const name =
    at && typeof at === "object" && "name" in at
      ? String((at as { name: string | null }).name ?? "").trim()
      : "";
  return {
    id: log.id,
    contentPreview,
    activityName: name || "활동",
    viewCount: views,
    syncCount: sync,
    syncPoints,
    viewPoints,
    bonusTotal,
    created_at: log.created_at,
  };
}

export function sumBreakdownParts(posts: PostBreakdown[]): {
  syncPoints: number;
  viewPoints: number;
  total: number;
} {
  let syncPoints = 0;
  let viewPoints = 0;
  for (const p of posts) {
    syncPoints += p.syncPoints;
    viewPoints += p.viewPoints;
  }
  return {
    syncPoints,
    viewPoints,
    total: syncPoints + viewPoints,
  };
}

/** 동점: 보너스 → Sync 수 → 최근 작성(created_at 내림차순). 배지는 1개만. */
export function pickBestContributorId(posts: PostBreakdown[]): string | null {
  if (posts.length === 0) return null;
  const sorted = [...posts].sort((a, b) => {
    if (b.bonusTotal !== a.bonusTotal) return b.bonusTotal - a.bonusTotal;
    if (b.syncCount !== a.syncCount) return b.syncCount - a.syncCount;
    const t = safeDateTimeMs(b.created_at) - safeDateTimeMs(a.created_at);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
  const top = sorted[0]!;
  return top.bonusTotal > 0 ? top.id : null;
}

export type WeekLineItem =
  | { kind: "post"; post: PostBreakdown }
  | { kind: "deleted"; key: string; bonusPoints: number };

/**
 * settlement_history.bonus_points(불변)과 현재 조회 가능한 로그 합의 차이를
 * 삭제된 활동 한 줄로 흡수합니다.
 */
export function mergeDeletedGap(
  rowBonusPoints: number,
  posts: PostBreakdown[],
  settlementRowId: string
): WeekLineItem[] {
  const safeRow = Math.max(0, Math.floor(Number(rowBonusPoints) || 0));
  const sumPosted = posts.reduce(
    (s, p) => s + Math.max(0, Math.floor(p.bonusTotal)),
    0
  );
  const remainder = safeRow - sumPosted;
  const lines: WeekLineItem[] = posts.map((post) => ({ kind: "post", post }));
  if (remainder > 0) {
    lines.push({
      kind: "deleted",
      key: `deleted-${settlementRowId}`,
      bonusPoints: remainder,
    });
  }
  return lines;
}
