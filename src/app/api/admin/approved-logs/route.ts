import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { estimatedBonusVibes } from "@/lib/rewards";

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
  is_settled: boolean;
  sync_count: number;
  estimated_bonus: number;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
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
      source_type,
      external_url,
      ai_evaluation,
      raw_content,
      view_count,
      is_settled,
      profiles ( nickname ),
      activity_types ( name, base_vibes ),
      activity_syncs ( count )
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

  const logs: ApprovedLogRow[] = (rows ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const vc =
      typeof row.view_count === "number" && !Number.isNaN(row.view_count)
        ? row.view_count
        : 0;

    const syncAgg = firstOrNull(
      row.activity_syncs as { count?: number | string | null } | null
    );
    const syncCountRaw =
      syncAgg?.count != null ? Number(syncAgg.count) : Number.NaN;
    const sc = Number.isFinite(syncCountRaw) ? syncCountRaw : 0;
    const aiEvaluationRaw = row.ai_evaluation;
    const aiEvaluation =
      aiEvaluationRaw != null && typeof aiEvaluationRaw === "object"
        ? (aiEvaluationRaw as Record<string, unknown>)
        : null;

    return {
      id: String(row.id),
      content: row.content != null ? String(row.content) : null,
      created_at: String(row.created_at),
      user_id: String(row.user_id),
      source_type: row.source_type != null ? String(row.source_type) : null,
      external_url: row.external_url != null ? String(row.external_url) : null,
      ai_evaluation: aiEvaluation,
      raw_content: row.raw_content != null ? String(row.raw_content) : null,
      view_count: vc,
      is_settled: Boolean(row.is_settled),
      sync_count: sc,
      estimated_bonus: estimatedBonusVibes(sc, vc),
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
