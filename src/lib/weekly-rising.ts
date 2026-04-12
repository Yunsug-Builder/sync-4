import type { SupabaseClient } from "@supabase/supabase-js";

/** RPC/스키마 캐시 이슈 시 주간 탭 폴백 (무한 로딩 방지용 카피) */
export const WEEKLY_RANKING_FALLBACK_MESSAGE = "현재 랭킹을 집계 중입니다";

const IS_DEV = process.env.NODE_ENV === "development";

/** get_weekly_rising_leaderboard 반환(별칭 display_name = profiles.nickname) */
const LEADERBOARD_RPC = "get_weekly_rising_leaderboard" as const;
const USER_PLACE_RPC = "get_weekly_rising_user_place" as const;

const EXPECTED_LEADERBOARD_ROW_KEYS = [
  "user_id",
  "display_name",
  "avatar_url",
  "weekly_points",
  "week_post_count",
  "week_sync_received",
  "week_view_sum",
] as const;

export type WeeklyLeaderboardRow = {
  user_id: string;
  /** DB에서 `nickname` 컬럼을 `display_name` 별칭으로 반환 — 표시용으로 이 필드만 사용 */
  display_name: string | null;
  avatar_url: string | null;
  weekly_points: number;
  week_post_count: number;
  week_sync_received: number;
  week_view_sum: number;
};

export type WeeklyUserPlace = {
  /** RPC `rank` (또는 호환 별칭) */
  rank: number;
  weekly_points: number;
  week_post_count: number;
  week_sync_received: number;
  week_view_sum: number;
};

function devWarn(message: string, payload?: Record<string, unknown>) {
  if (!IS_DEV) return;
  console.warn(`[weekly-rising] ${message}`, payload ?? "");
}

function logRpcFailure(
  rpc: string,
  params: Record<string, unknown>,
  err: { message?: string; code?: string; details?: string; hint?: string }
) {
  if (!IS_DEV) return;
  console.warn(`[weekly-rising] RPC failure: ${rpc}`, {
    params,
    code: err.code,
    message: err.message,
    details: err.details,
    hint: err.hint,
  });
}

function logLeaderboardRowShapeMismatch(sample: Record<string, unknown>) {
  if (!IS_DEV) return;
  const keys = Object.keys(sample);
  const missing = EXPECTED_LEADERBOARD_ROW_KEYS.filter((k) => !(k in sample));
  if (missing.includes("display_name") && "nickname" in sample) {
    devWarn(
      "leaderboard row: `display_name` alias missing; falling back to `nickname` (align SQL: p.nickname as display_name)",
      { receivedKeys: keys }
    );
    return;
  }
  devWarn("leaderboard row: expected keys missing (check RPC SELECT vs client)", {
    receivedKeys: keys,
    missingExpected: missing.length ? missing : undefined,
    hint: "profiles has nickname; expose as display_name in RPC returns table",
  });
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * RPC `display_name` 우선, 구 스키마 `nickname`만 있을 때만 대체.
 * profiles.display_name 컬럼은 없고, DB는 nickname → display_name 별칭만 반환한다.
 */
function pickDisplayNameFromRpcRow(r: Record<string, unknown>): string | null {
  const primary = r.display_name;
  const legacy = r.nickname;
  if (typeof primary === "string") return primary;
  if (primary === null) return null;
  if (typeof legacy === "string") return legacy;
  if (legacy === null) return null;
  return null;
}

/**
 * RPC 순위 필드: `rank` 기본, 일부 배포에서 `ranking`/`rnk` 등 호환.
 */
function pickRankFromRpcRow(r: Record<string, unknown>): number {
  const candidates: unknown[] = [r.rank, r.ranking, r.rnk, r.place, r.rank_num];
  for (const c of candidates) {
    const n = num(c, 0);
    if (n > 0) return n;
  }
  return 0;
}

/**
 * RPC 행을 정규화합니다. weekly_points ≤ 0 제거, 점수 내림차순·user_id 보조 정렬.
 */
export function normalizeWeeklyLeaderboardRows(
  raw: Record<string, unknown>[]
): WeeklyLeaderboardRow[] {
  if (IS_DEV && raw.length > 0) {
    const sample = raw[0];
    const missing = EXPECTED_LEADERBOARD_ROW_KEYS.filter((k) => !(k in sample));
    if (missing.length) {
      logLeaderboardRowShapeMismatch(sample);
    }
  }

  const mapped: WeeklyLeaderboardRow[] = raw.map((r) => ({
    user_id: String(r.user_id ?? ""),
    display_name: pickDisplayNameFromRpcRow(r),
    avatar_url: (r.avatar_url as string | null) ?? null,
    weekly_points: num(r.weekly_points),
    week_post_count: num(r.week_post_count),
    week_sync_received: num(r.week_sync_received),
    week_view_sum: num(r.week_view_sum),
  }));

  const positive = mapped.filter((row) => row.weekly_points > 0 && row.user_id.length > 0);

  positive.sort((a, b) => {
    if (b.weekly_points !== a.weekly_points) {
      return b.weekly_points - a.weekly_points;
    }
    return a.user_id.localeCompare(b.user_id);
  });

  return positive;
}

export async function fetchWeeklyRisingLeaderboard(
  supabase: SupabaseClient,
  limit = 50
): Promise<{ rows: WeeklyLeaderboardRow[]; error: string | null }> {
  const params = { p_limit: limit };
  const { data, error } = await supabase.rpc(LEADERBOARD_RPC, params);

  if (error) {
    logRpcFailure(LEADERBOARD_RPC, params, error);
    return { rows: [], error: error.message };
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  const rows = normalizeWeeklyLeaderboardRows(raw);

  return { rows, error: null };
}

export async function fetchWeeklyRisingUserPlace(
  supabase: SupabaseClient,
  userId: string
): Promise<{ place: WeeklyUserPlace | null; error: string | null }> {
  const uid = userId.trim();
  if (!uid) {
    return { place: null, error: null };
  }

  const params = { p_user_id: uid };
  const { data, error } = await supabase.rpc(USER_PLACE_RPC, params);

  if (error) {
    logRpcFailure(USER_PLACE_RPC, params, error);
    return { place: null, error: error.message };
  }

  let raw: unknown = data;
  if (Array.isArray(data)) {
    raw = data[0];
  }
  if (!raw || typeof raw !== "object") {
    if (IS_DEV) {
      devWarn(
        `${USER_PLACE_RPC}: empty or non-object response (no row for user or RPC shape)`,
        { p_user_id: uid, receivedType: raw === null ? "null" : typeof raw }
      );
    }
    return { place: null, error: null };
  }

  const r = raw as Record<string, unknown>;
  const rank = pickRankFromRpcRow(r);
  const wp = num(r.weekly_points);
  if (rank <= 0 || wp <= 0) {
    if (IS_DEV) {
      const keys = Object.keys(r);
      const hasNumericRank =
        typeof r.rank === "number" ||
        typeof r.ranking === "number" ||
        (typeof r.rank === "string" && r.rank.trim() !== "");
      const hasNumericPoints = r.weekly_points != null && String(r.weekly_points).length > 0;
      if (keys.length > 0 && hasNumericRank && hasNumericPoints && (rank <= 0 || wp <= 0)) {
        devWarn(`${USER_PLACE_RPC}: rank/weekly_points present but parsed as invalid — check column names`, {
          p_user_id: uid,
          receivedKeys: keys,
          rawRank: r.rank,
          rawRanking: r.ranking,
          rawWeeklyPoints: r.weekly_points,
          parsedRank: rank,
          parsedWeeklyPoints: wp,
        });
      }
    }
    return { place: null, error: null };
  }

  return {
    place: {
      rank: Math.floor(rank),
      weekly_points: wp,
      week_post_count: num(r.week_post_count),
      week_sync_received: num(r.week_sync_received),
      week_view_sum: num(r.week_view_sum),
    },
    error: null,
  };
}

export function formatWeeklyActivitySubtitle(row: WeeklyLeaderboardRow) {
  return `이번 주 Sync ${row.week_sync_received.toLocaleString("ko-KR")}개 획득 · 게시글 ${row.week_post_count.toLocaleString("ko-KR")} · 조회 ${row.week_view_sum.toLocaleString("ko-KR")}`;
}
