import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { getAccessTokenFromRequest, isAdminByAccessToken } from "@/lib/admin-auth";

export async function POST(request: Request) {
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
  const { data, error } = await supabase.rpc("perform_weekly_settlement");

  if (error) {
    console.error("[admin/perform-weekly-settlement]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const n =
    typeof data === "number" && Number.isFinite(data) ? Math.max(0, Math.floor(data)) : 0;

  return NextResponse.json({ ok: true, data: n });
}
