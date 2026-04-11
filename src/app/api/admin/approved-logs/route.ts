import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { estimatedBonusPoints } from "@/lib/rewards";

export type ApprovedLogRow = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  view_count: number;
  is_settled: boolean;
  sync_count: number;
  estimated_bonus: number;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_points: number } | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. 관리자 API는 서비스 롤 키가 필요합니다.",
      },
      { status: 503 }
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: rows, error } = await supabase
    .from("activity_logs")
    .select(
      `
      id,
      content,
      created_at,
      user_id,
      view_count,
      is_settled,
      profiles ( nickname ),
      activity_types ( name, base_points )
    `
    )
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/approved-logs]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const logs: ApprovedLogRow[] = [];

  for (const raw of rows ?? []) {
    const row = raw as Record<string, unknown>;
    const id = String(row.id);
    const { count: syncCount } = await supabase
      .from("activity_syncs")
      .select("*", { count: "exact", head: true })
      .eq("activity_log_id", id);

    const vc =
      typeof row.view_count === "number" && !Number.isNaN(row.view_count)
        ? row.view_count
        : 0;
    const sc = syncCount ?? 0;
    const est = estimatedBonusPoints(sc, vc);

    logs.push({
      id,
      content: row.content != null ? String(row.content) : null,
      created_at: String(row.created_at),
      user_id: String(row.user_id),
      view_count: vc,
      is_settled: Boolean(row.is_settled),
      sync_count: sc,
      estimated_bonus: est,
      profiles: firstOrNull(row.profiles as { nickname: string | null } | null),
      activity_types: firstOrNull(
        row.activity_types as { name: string; base_points: number } | null
      ),
    });
  }

  return NextResponse.json({
    ok: true,
    logs,
  });
}
