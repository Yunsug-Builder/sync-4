import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { getAccessTokenFromRequest, isAdminByAccessToken } from "@/lib/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  const token = getAccessTokenFromRequest(_request);
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
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/reject]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!data?.id) {
    return NextResponse.json(
      { ok: false, error: "not_found_or_not_pending" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
