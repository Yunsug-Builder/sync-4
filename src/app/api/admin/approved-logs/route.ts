import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { estimatedBonusVibes } from "@/lib/rewards";
import { getAccessTokenFromRequest, isAdminByAccessToken } from "@/lib/admin-auth";

export type ApprovedLogRow = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  source_type: string | null;
  external_url: string | null;
  ai_evaluation: Record<string, unknown> | null;
  raw_content: string | null;
  view_count: number;
  qualified_view_count: number;
  is_settled: boolean;
  sync_count: number;
  estimated_bonus: number;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};

type ActivitySyncCountRow = {
  activity_id: string;
  sync_count: number | string | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toNonNegativeInteger(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export async function GET(request: Request) {
  const token = getAccessTokenFromRequest(request);
  if (!token || !(await isAdminByAccessToken(token))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
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
      source_type,
      external_url,
      ai_evaluation,
      raw_content,
      view_count,
      qualified_view_count,
      is_settled,
      profiles ( nickname ),
      activity_types ( name, base_vibes )
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

  const rawRows = rows ?? [];
  const activityIds = rawRows.map((raw) => String((raw as Record<string, unknown>).id));
  const syncCountByActivityId = new Map<string, number>();

  if (activityIds.length > 0) {
    const { data: syncCounts, error: syncCountError } = await supabase.rpc(
      "get_activity_sync_counts",
      { p_activity_ids: activityIds }
    );

    if (syncCountError) {
      console.error("[admin/approved-logs] sync counts", syncCountError);
      return NextResponse.json(
        { ok: false, error: syncCountError.message },
        { status: 500 }
      );
    }

    for (const row of (syncCounts ?? []) as ActivitySyncCountRow[]) {
      syncCountByActivityId.set(
        String(row.activity_id),
        toNonNegativeInteger(row.sync_count)
      );
    }
  }

  const logs: ApprovedLogRow[] = rawRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const id = String(row.id);
    const vc =
      typeof row.view_count === "number" && !Number.isNaN(row.view_count)
        ? row.view_count
        : 0;
    const qvc =
      typeof row.qualified_view_count === "number" && !Number.isNaN(row.qualified_view_count)
        ? row.qualified_view_count
        : 0;

    const sc = syncCountByActivityId.get(id) ?? 0;
    const aiEvaluationRaw = row.ai_evaluation;
    const aiEvaluation =
      aiEvaluationRaw != null && typeof aiEvaluationRaw === "object"
        ? (aiEvaluationRaw as Record<string, unknown>)
        : null;

    return {
      id,
      content: row.content != null ? String(row.content) : null,
      created_at: String(row.created_at),
      user_id: String(row.user_id),
      source_type: row.source_type != null ? String(row.source_type) : null,
      external_url: row.external_url != null ? String(row.external_url) : null,
      ai_evaluation: aiEvaluation,
      raw_content: row.raw_content != null ? String(row.raw_content) : null,
      view_count: vc,
      qualified_view_count: qvc,
      is_settled: Boolean(row.is_settled),
      sync_count: sc,
      estimated_bonus: estimatedBonusVibes(sc, qvc),
      profiles: firstOrNull(row.profiles as { nickname: string | null } | null),
      activity_types: firstOrNull(
        row.activity_types as { name: string; base_vibes: number } | null
      ),
    };
  });

  return NextResponse.json({
    ok: true,
    logs,
  });
}
