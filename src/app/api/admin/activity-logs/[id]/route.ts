import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { getAccessTokenFromRequest, isAdminByAccessToken } from "@/lib/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(request: Request, context: Ctx) {
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

  const { id } = await context.params;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select(
      `
      id,
      user_id,
      status,
      content,
      raw_content,
      proof_url,
      image_urls,
      ai_evaluation,
      ai_score,
      created_at,
      profiles ( nickname ),
      activity_types ( name, base_vibes )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    log: {
      id: String(row.id),
      user_id: String(row.user_id),
      status: String(row.status ?? ""),
      content: row.content != null ? String(row.content) : "",
      raw_content: row.raw_content != null ? String(row.raw_content) : "",
      proof_url: row.proof_url != null ? String(row.proof_url) : null,
      image_urls: Array.isArray(row.image_urls)
        ? row.image_urls.filter((v): v is string => typeof v === "string")
        : [],
      ai_evaluation:
        row.ai_evaluation != null && typeof row.ai_evaluation === "object"
          ? (row.ai_evaluation as Record<string, unknown>)
          : null,
      ai_score:
        typeof row.ai_score === "number" && Number.isFinite(row.ai_score)
          ? row.ai_score
          : null,
      created_at: String(row.created_at),
      profiles: firstOrNull(row.profiles as { nickname: string | null } | null),
      activity_types: firstOrNull(
        row.activity_types as { name: string; base_vibes: number } | null
      ),
    },
  });
}

