import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { getAccessTokenFromRequest, isAdminByAccessToken } from "@/lib/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

type ApproveRpcPayload = {
  ok?: boolean;
  error?: string;
  vibes_added?: number;
};

type ApproveRequestBody = {
  final_vibes?: number;
  ai_evaluation?: Record<string, unknown> | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * PostgREST / Supabase 가 jsonb RPC 결과를 객체·JSON 문자열·단일 원소 배열 등으로 줄 수 있어
 * 실패 사유(error)를 읽을 때만 사용합니다. 성공 여부는 DB 행 상태로 판정합니다.
 */
function parseApproveRpcPayload(data: unknown): ApproveRpcPayload {
  if (data == null) return {};
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      return parseApproveRpcPayload(parsed);
    } catch {
      return {};
    }
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return {};
    return parseApproveRpcPayload(data[0]);
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    if ("ok" in o || "error" in o) {
      return o as ApproveRpcPayload;
    }
    for (const k of [
      "result",
      "data",
      "admin_approve_activity_log_v2",
      "admin_approve_activity_log",
    ]) {
      if (k in o) {
        return parseApproveRpcPayload(o[k]);
      }
    }
    return o as ApproveRpcPayload;
  }
  return {};
}

export async function POST(request: Request, context: Ctx) {
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
  let requestBody: ApproveRequestBody = {};

  try {
    requestBody = (await request.json()) as ApproveRequestBody;
  } catch {
    requestBody = {};
  }

  const finalVibes =
    typeof requestBody.final_vibes === "number" &&
    Number.isFinite(requestBody.final_vibes)
      ? Math.max(0, Math.floor(requestBody.final_vibes))
      : 0;
  const aiEvaluation =
    requestBody.ai_evaluation != null &&
    typeof requestBody.ai_evaluation === "object"
      ? requestBody.ai_evaluation
      : null;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_approve_activity_log_v2",
    {
      p_log_id: id,
      p_final_vibes: finalVibes,
      p_ai_evaluation: aiEvaluation,
    }
  );

  if (rpcError) {
    console.error("[admin/approve] rpc", rpcError);
    return NextResponse.json(
      { ok: false, error: rpcError.message },
      { status: 500 }
    );
  }

  const { data: row, error: rowError } = await supabase
    .from("activity_logs")
    .select("status, activity_types ( base_vibes )")
    .eq("id", id)
    .maybeSingle();

  if (rowError) {
    console.error("[admin/approve] select", rowError);
    return NextResponse.json(
      { ok: false, error: rowError.message },
      { status: 500 }
    );
  }

  if (!row) {
    const payload = parseApproveRpcPayload(rpcData);
    return NextResponse.json(
      { ok: false, error: payload.error ?? "not_found" },
      { status: 404 }
    );
  }

  const at = firstOrNull(
    row.activity_types as { base_vibes?: number } | null | undefined
  );
  const vibesAdded =
    typeof at?.base_vibes === "number" ? at.base_vibes : undefined;

  if (row.status === "approved") {
    return NextResponse.json({
      ok: true,
      vibes_added: vibesAdded,
    });
  }

  const payload = parseApproveRpcPayload(rpcData);

  if (row.status === "pending") {
    const code = payload.error === "not_found_or_not_pending" ? 404 : 409;
    return NextResponse.json(
      {
        ok: false,
        error: payload.error ?? "approve_failed",
      },
      { status: code }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "unexpected_status",
    },
    { status: 409 }
  );
}
