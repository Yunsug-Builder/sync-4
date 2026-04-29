import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { getAccessTokenFromRequest, isAdminByAccessToken } from "@/lib/admin-auth";

export type PendingLogRow = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  source_type: string | null;
  external_url: string | null;
  ai_evaluation: Record<string, unknown> | null;
  raw_content: string | null;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function normalizePendingRow(row: Record<string, unknown>): PendingLogRow {
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
    profiles: firstOrNull(row.profiles as { nickname: string | null } | null),
    activity_types: firstOrNull(
      row.activity_types as { name: string; base_vibes: number } | null
    ),
  };
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

  const { data, error } = await supabase
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
      profiles ( nickname ),
      activity_types ( name, base_vibes )
    `
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/pending-logs]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const logs = (data ?? []).map((row) =>
    normalizePendingRow(row as Record<string, unknown>)
  );

  return NextResponse.json({
    ok: true,
    logs,
  });
}
