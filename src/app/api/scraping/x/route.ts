import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAnonClient } from "@/lib/supabase";
import { normalizeProofUrl } from "@/lib/utils/proof-url";

type ScrapeRequestBody = {
  tweetUrl?: string;
};

type ProfileRow = {
  x_handle: string | null;
  is_x_verified: boolean | null;
};

type SocialDataTweetResponse = {
  full_text?: unknown;
  text?: unknown;
  user?: {
    screen_name?: unknown;
  } | null;
  entities?: {
    media?: Array<{
      media_url_https?: unknown;
      media_url?: unknown;
      type?: unknown;
    }> | null;
  } | null;
  extended_entities?: {
    media?: Array<{
      media_url_https?: unknown;
      media_url?: unknown;
      type?: unknown;
    }> | null;
  } | null;
};

const SOCIALDATA_BASE_URL =
  process.env.SOCIALDATA_API_BASE_URL ??
  "https://api.socialdata.tools/twitter/statuses/show";
const ACTIVITY_IMAGES_BUCKET = "activity-images";
const TRAILING_TCO_RE = /\s+https?:\/\/t\.co\/[A-Za-z0-9_]+\/?$/i;

function extractAccessToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

function extractTweetId(tweetUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(tweetUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
  if (!allowedHosts.has(host)) {
    return null;
  }

  const match = parsed.pathname.match(/\/status\/(\d+)/i);
  return match?.[1] ?? null;
}

function pickTweetText(payload: SocialDataTweetResponse): string {
  if (typeof payload.full_text === "string" && payload.full_text.trim()) {
    return payload.full_text;
  }
  if (typeof payload.text === "string" && payload.text.trim()) {
    return payload.text;
  }
  return "";
}

function removeTrailingTcoMediaUrls(rawText: string): string {
  let next = rawText.trimEnd();
  while (TRAILING_TCO_RE.test(next)) {
    next = next.replace(TRAILING_TCO_RE, "").trimEnd();
  }
  return next;
}

function pickTweetMediaUrls(payload: SocialDataTweetResponse): string[] {
  const mediaCandidates = payload.extended_entities?.media ?? payload.entities?.media ?? [];
  if (!Array.isArray(mediaCandidates)) return [];

  const urls = mediaCandidates
    .map((media) => {
      if (typeof media.media_url_https === "string" && media.media_url_https.trim()) {
        return media.media_url_https;
      }
      if (typeof media.media_url === "string" && media.media_url.trim()) {
        return media.media_url;
      }
      return null;
    })
    .filter((url): url is string => Boolean(url));

  return [...new Set(urls)];
}

function inferImageExtension(url: string, contentType: string | null): string {
  const normalizedType = (contentType ?? "").toLowerCase();
  if (normalizedType.includes("image/jpeg") || normalizedType.includes("image/jpg")) return "jpg";
  if (normalizedType.includes("image/png")) return "png";
  if (normalizedType.includes("image/webp")) return "webp";
  if (normalizedType.includes("image/gif")) return "gif";

  try {
    const parsed = new URL(url);
    const ext = parsed.pathname.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "jpeg") return "jpg";
    if (ext === "jpg" || ext === "png" || ext === "webp" || ext === "gif") return ext;
  } catch {
    // noop
  }

  return "jpg";
}

async function mirrorTweetImagesToSupabase(
  supabase: SupabaseClient,
  userId: string,
  imageUrls: string[]
): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  if (imageUrls.length === 0) {
    return { ok: true, urls: [] };
  }

  const mirroredUrls: string[] = [];

  for (const imageUrl of imageUrls) {
    let externalResponse: Response;
    try {
      externalResponse = await fetch(imageUrl, { method: "GET", cache: "no-store" });
    } catch {
      return { ok: false, error: "트윗 이미지 미러링 중 네트워크 오류가 발생했습니다." };
    }

    if (!externalResponse.ok) {
      return {
        ok: false,
        error: `트윗 이미지 다운로드에 실패했습니다. (status: ${externalResponse.status})`,
      };
    }

    const contentType = externalResponse.headers.get("content-type");
    if (!contentType?.toLowerCase().startsWith("image/")) {
      return { ok: false, error: "트윗 미디어가 이미지 형식이 아닙니다." };
    }

    const bytes = await externalResponse.arrayBuffer();
    const ext = inferImageExtension(imageUrl, contentType);
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(ACTIVITY_IMAGES_BUCKET)
      .upload(path, bytes, {
        cacheControl: "3600",
        upsert: false,
        contentType,
      });
    if (uploadError) {
      return { ok: false, error: `트윗 이미지 업로드에 실패했습니다. (${uploadError.message})` };
    }

    const { data: publicData } = supabase.storage.from(ACTIVITY_IMAGES_BUCKET).getPublicUrl(path);
    mirroredUrls.push(publicData.publicUrl);
  }

  return { ok: true, urls: mirroredUrls };
}

async function fetchTweetFromSocialData(tweetId: string, apiKey: string) {
  const endpoint = new URL(SOCIALDATA_BASE_URL);
  endpoint.searchParams.set("id", tweetId);

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
}

function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_URL 이 누락되었습니다.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.SOCIALDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "SOCIALDATA_API_KEY가 서버에 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "인증 토큰이 없습니다. 다시 로그인해 주세요." },
      { status: 401 }
    );
  }

  let body: ScrapeRequestBody = {};
  try {
    body = (await request.json()) as ScrapeRequestBody;
  } catch {
    body = {};
  }

  const tweetUrl = normalizeProofUrl(body.tweetUrl ?? "");
  if (!tweetUrl) {
    return NextResponse.json({ ok: false, error: "tweetUrl이 필요합니다." }, { status: 400 });
  }

  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    return NextResponse.json(
      { ok: false, error: "유효한 X(트위터) 게시글 URL이 아닙니다." },
      { status: 400 }
    );
  }

  try {
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
      .select("x_handle, is_x_verified")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: "프로필 조회 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    if (!profile?.x_handle) {
      return NextResponse.json(
        { ok: false, error: "연동된 X 계정이 없습니다." },
        { status: 403 }
      );
    }

    if (!profile.is_x_verified) {
      return NextResponse.json(
        { ok: false, error: "X 계정 인증이 필요합니다." },
        { status: 403 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const normalizedUrl = tweetUrl;
    console.log("조회 전 normalizedUrl:", normalizedUrl);
    const { data: existingPost, error: duplicateError } = await supabaseAdmin
      .from("activity_logs")
      .select("*")
      .eq("proof_url", normalizedUrl)
      .maybeSingle();
    console.log("조회된 데이터:", existingPost);

    if (duplicateError) {
      return NextResponse.json(
        { ok: false, error: duplicateError.message },
        { status: 500 }
      );
    }

    if (existingPost) {
      const status = (existingPost as { status?: string }).status;
      if (status === "pending") {
        return NextResponse.json(
          { ok: false, error: "이미 심사 대기 중인 트윗입니다." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: "이미 처리된 트윗입니다. 삭제 후 재등록은 불가능합니다.",
        },
        { status: 400 }
      );
    } else {
      // normalizedUrl과 DB 저장값의 불일치 여부를 빠르게 확인하기 위한 추가 로그
      const { data: sameTweetIdRows } = await supabaseAdmin
        .from("activity_logs")
        .select("id, status, proof_url")
        .ilike("proof_url", `%/status/${tweetId}%`)
        .limit(10);
      console.log("동일 tweetId 후보 rows:", sameTweetIdRows);
    }

    const { response, payload } = await fetchTweetFromSocialData(tweetId, apiKey);

    if (!response.ok) {
      const apiError =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as Record<string, unknown>).error)
          : `SocialData API 요청 실패 (status: ${response.status})`;

      return NextResponse.json({ ok: false, error: apiError }, { status: 502 });
    }

    const tweet = (payload ?? {}) as SocialDataTweetResponse;
    const authorHandleRaw = tweet.user?.screen_name;
    const authorHandle = typeof authorHandleRaw === "string" ? normalizeHandle(authorHandleRaw) : "";
    const linkedHandle = normalizeHandle(profile.x_handle);

    if (!authorHandle || authorHandle !== linkedHandle) {
      return NextResponse.json(
        {
          ok: false,
          error: "게시글 작성자와 연동된 X 계정이 일치하지 않습니다.",
        },
        { status: 403 }
      );
    }

    const fullText = removeTrailingTcoMediaUrls(pickTweetText(tweet));
    const mediaUrls = pickTweetMediaUrls(tweet);
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!projectUrl || !anonKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase 환경 변수가 누락되어 이미지 미러링을 수행할 수 없습니다." },
        { status: 503 }
      );
    }
    const authedSupabase = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const mirrored = await mirrorTweetImagesToSupabase(authedSupabase, user.id, mediaUrls);
    if (!mirrored.ok) {
      return NextResponse.json({ ok: false, error: mirrored.error }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      tweetId,
      proof_url: normalizedUrl,
      full_text: fullText,
      image_urls: mirrored.urls,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "스크래핑 처리 중 알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
