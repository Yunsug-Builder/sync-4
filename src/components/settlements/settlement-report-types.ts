import { estimatedBonusVibes } from "@/lib/rewards";
import { safeDateTimeMs } from "@/lib/week-utils";

export type SettlementHistoryRow = {
  id: string;
  week_start: string;
  bonus_vibes: number;
  created_at: string;
};

export type PostBreakdown = {
  id: string;
  contentPreview: string;
  activityName: string;
  thumbnailUrl: string | null;
  viewCount: number;
  syncCount: number;
  syncVibes: number;
  viewVibes: number;
  bonusTotal: number;
  created_at: string;
};

export function buildPostBreakdown(
  log: {
    id: string;
    content: string | null;
    proof_url?: string | null;
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
  const syncVibes = sync * 5;
  const viewVibes = Math.floor(views / 10);
  const bonusTotal = estimatedBonusVibes(sync, views);
  const raw = log.content?.trim() ?? "";
  const contentPreview =
    raw.length > 120 ? `${raw.slice(0, 120)}…` : raw || "내용 없음";
  const proof =
    typeof log.proof_url === "string" && log.proof_url.trim().length > 0
      ? log.proof_url.trim()
      : null;

  const at = log.activity_types;
  const name =
    at && typeof at === "object" && "name" in at
      ? String((at as { name: string | null }).name ?? "").trim()
      : "";
  return {
    id: log.id,
    contentPreview,
    activityName: name || "활동",
    thumbnailUrl: proof,
    viewCount: views,
    syncCount: sync,
    syncVibes,
    viewVibes,
    bonusTotal,
    created_at: log.created_at,
  };
}

export function sumBreakdownParts(posts: PostBreakdown[]): {
  syncVibes: number;
  viewVibes: number;
  total: number;
} {
  let syncVibes = 0;
  let viewVibes = 0;
  for (const p of posts) {
    syncVibes += p.syncVibes;
    viewVibes += p.viewVibes;
  }
  return {
    syncVibes,
    viewVibes,
    total: syncVibes + viewVibes,
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
  | { kind: "deleted"; key: string; bonusVibes: number };

/**
 * settlement_history.bonus_vibes(불변)과 현재 조회 가능한 로그 합의 차이를
 * 삭제된 활동 한 줄로 흡수합니다.
 */
export function mergeDeletedGap(
  rowBonusVibes: number,
  posts: PostBreakdown[],
  settlementRowId: string
): WeekLineItem[] {
  const safeRow = Math.max(0, Math.floor(Number(rowBonusVibes) || 0));
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
      bonusVibes: remainder,
    });
  }
  return lines;
}
