import { NextResponse } from "next/server";
import { createSupabaseAnonClient } from "@/lib/supabase";

type SubmitBody = {
  artist_id?: string;
  activity_type_id?: string;
  content?: string;
  proof_url?: string | null;
};

function extractAccessToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeProofUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch {
    return null;
  }
}

function mapInsertError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("activity_logs_content_nonempty")) {
    return "인증 내용을 입력해 주세요.";
  }
  if (lower.includes("foreign key") || lower.includes("23503")) {
    return "저장에 실패했습니다. 활동 유형 또는 아티스트 데이터를 확인해 주세요.";
  }
  if (lower.includes("row-level security") || lower.includes("42501")) {
    return "저장 권한이 없습니다. 로그인 상태를 확인해 주세요.";
  }
  if (lower.includes("duplicate") || lower.includes("unique") || lower.includes("23505")) {
    return "이미 등록된 게시글입니다.";
  }
  return message;
}

export async function POST(request: Request) {
  try {
    const accessToken = extractAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "인증 토큰이 없습니다. 다시 로그인해 주세요." },
        { status: 401 }
      );
    }

    let body: SubmitBody = {};
    try {
      body = (await request.json()) as SubmitBody;
    } catch {
      body = {};
    }

    const artistId = (body.artist_id ?? "").trim();
    const activityTypeId = (body.activity_type_id ?? "").trim();
    const content = (body.content ?? "").trim();
    const proofUrl = normalizeProofUrl(body.proof_url ?? null);

    if (!artistId || !activityTypeId) {
      return NextResponse.json(
        { ok: false, error: "활동 유형 또는 아티스트 정보가 올바르지 않습니다." },
        { status: 400 }
      );
    }
    if (!content) {
      return NextResponse.json(
        { ok: false, error: "인증 내용을 입력해 주세요." },
        { status: 400 }
      );
    }
    if (body.proof_url && !proofUrl) {
      return NextResponse.json(
        { ok: false, error: "원문 링크(URL) 형식을 확인해 주세요." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAnonClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "로그인 세션이 유효하지 않습니다." },
        { status: 401 }
      );
    }

    if (proofUrl) {
      const { data: existed, error: duplicateCheckError } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("proof_url", proofUrl)
        .limit(1)
        .maybeSingle();

      if (duplicateCheckError) {
        return NextResponse.json(
          { ok: false, error: duplicateCheckError.message },
          { status: 500 }
        );
      }
      if (existed?.id) {
        return NextResponse.json(
          { ok: false, error: "이미 등록된 게시글입니다." },
          { status: 409 }
        );
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("activity_logs")
      .insert({
        user_id: user.id,
        artist_id: artistId,
        activity_type_id: activityTypeId,
        content,
        proof_url: proofUrl,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: mapInsertError(insertError.message) },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: inserted?.id ?? null,
      message: "활동 인증이 등록되었습니다.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "등록 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
