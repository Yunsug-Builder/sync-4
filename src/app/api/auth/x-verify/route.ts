import { NextResponse } from "next/server";
import { createSupabaseAnonClient } from "@/lib/supabase";

type VerifyProfileRow = {
  x_handle: string | null;
  verification_code: string | null;
};

function extractAccessToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeXHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

async function fetchXProfileHtml(xHandle: string): Promise<string> {
  const profileUrl = `https://x.com/${encodeURIComponent(xHandle)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(profileUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      const blocked = response.status === 403 || response.status === 429;
      const responseText = await response.text().catch(() => "");
      console.error("[x-verify] X profile fetch failed", {
        profileUrl,
        xHandle,
        status: response.status,
        statusText: response.statusText,
        blockedByX: blocked,
        responseSnippet: responseText.slice(0, 300),
      });
      throw new Error(
        blocked
          ? "X 프로필 조회가 차단되었습니다. User-Agent/외부 스크래핑 API(예: 프록시+렌더링) 패턴을 사용해 주세요."
          : `X 프로필 조회에 실패했습니다. (status: ${response.status})`
      );
    }

    return await response.text();
  } catch (error) {
    console.error("[x-verify] Unexpected error while fetching X profile", {
      profileUrl,
      xHandle,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("x_handle, verification_code")
      .eq("id", user.id)
      .maybeSingle<VerifyProfileRow>();

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: profileError.message },
        { status: 500 }
      );
    }

    if (!profile?.x_handle) {
      return NextResponse.json(
        { ok: false, error: "연동된 X 아이디가 없습니다." },
        { status: 400 }
      );
    }

    if (!profile?.verification_code) {
      return NextResponse.json(
        { ok: false, error: "인증 코드가 없습니다." },
        { status: 400 }
      );
    }

    const normalizedHandle = normalizeXHandle(profile.x_handle);
    const profileHtml = await fetchXProfileHtml(normalizedHandle);
    const hasCode = profileHtml.includes(profile.verification_code);

    if (!hasCode) {
      return NextResponse.json(
        { ok: false, error: "프로필에서 코드를 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_x_verified: true })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "X 계정 소유권 인증이 완료되었습니다.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "인증 중 알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
