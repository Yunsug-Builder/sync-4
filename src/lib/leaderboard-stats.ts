import type { SupabaseClient } from "@supabase/supabase-js";

export type UserActivityStats = {
  postCount: number;
  syncCount: number;
  viewSum: number;
};

const SYNC_IN_CHUNK = 300;

/**
 * 승인된 활동 기준: 게시글 수, 받은 Sync 총수, 조회수 합.
 */
export async function fetchUserActivityStatsMap(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserActivityStats>> {
  const map = new Map<string, UserActivityStats>();
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  for (const id of ids) {
    map.set(id, { postCount: 0, syncCount: 0, viewSum: 0 });
  }
  if (ids.length === 0) return map;

  const { data: logs, error: logErr } = await supabase
    .from("activity_logs")
    .select("id, user_id, view_count")
    .eq("status", "approved")
    .in("user_id", ids);

  if (logErr || !logs?.length) {
    return map;
  }

  const logToUser = new Map<string, string>();
  const logIds: string[] = [];

  for (const row of logs) {
    const r = row as { id: string; user_id: string; view_count?: number | null };
    const uid = String(r.user_id);
    const st = map.get(uid);
    if (st) {
      st.postCount += 1;
      const vc =
        typeof r.view_count === "number" && !Number.isNaN(r.view_count)
          ? Math.max(0, Math.floor(r.view_count))
          : 0;
      st.viewSum += vc;
    }
    const lid = String(r.id);
    logIds.push(lid);
    logToUser.set(lid, uid);
  }

  for (let i = 0; i < logIds.length; i += SYNC_IN_CHUNK) {
    const chunk = logIds.slice(i, i + SYNC_IN_CHUNK);
    const { data: syncs, error: syncErr } = await supabase
      .from("activity_syncs")
      .select("activity_log_id")
      .in("activity_log_id", chunk);

    if (syncErr) {
      break;
    }
    for (const s of syncs ?? []) {
      const row = s as { activity_log_id: string };
      const uid = logToUser.get(String(row.activity_log_id));
      if (!uid) continue;
      const st = map.get(uid);
      if (st) st.syncCount += 1;
    }
  }

  return map;
}
