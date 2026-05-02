import { after, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseAnonClient } from "@/lib/supabase";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";
import { normalizeProofUrl } from "@/lib/utils/proof-url";

type SubmitBody = {
  artist_id?: string;
  activity_type_id?: string;
  content?: string;
  raw_content?: string;
  proof_url?: string | null;
  image_urls?: unknown;
};

type DeleteBody = {
  id?: string;
};

type UpdateBody = {
  id?: string;
  content?: string;
  raw_content?: string;
  image_urls?: unknown;
};

type AiRecommendation = "APPROVE" | "REVIEW" | "REJECT";

type AiEvaluationResult = {
  score: number;
  recommendation: AiRecommendation;
  suggested_vibe: number;
  pros: string[];
  cons: string[];
  reasoning: string;
};

function extractAccessToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isAllowedActivityImageUrl(url: string, projectUrl: string): boolean {
  const base = projectUrl.replace(/\/$/, "");
  return url.startsWith(`${base}/storage/v1/object/public/activity-images/`);
}

function normalizeImageUrls(
  raw: unknown,
  projectUrl: string | undefined
): { ok: true; urls: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, urls: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "이미지 URL 형식이 올바르지 않습니다." };
  }
  if (raw.length > 20) {
    return { ok: false, error: "이미지는 최대 20장까지 첨부할 수 있습니다." };
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return { ok: false, error: "이미지 URL 형식이 올바르지 않습니다." };
    }
    const t = item.trim();
    if (!t) continue;
    let parsed: URL;
    try {
      parsed = new URL(t);
    } catch {
      return { ok: false, error: "이미지 URL 형식이 올바르지 않습니다." };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "이미지 URL 형식이 올바르지 않습니다." };
    }
    const s = parsed.toString();
    out.push(s);
  }
  return { ok: true, urls: out };
}

const ACTIVITY_IMAGES_BUCKET = "activity-images";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const AI_REVIEW_SYSTEM_PROMPT = `
당신은 아이돌/아티스트 팬덤 커뮤니티의 깐깐하지만 유연한 콘텐츠 심사역입니다. 유저의 글, 사진, 그리고 [제출된 아티스트와 카테고리] 메타데이터를 종합적으로 교차 검증합니다.

[엄격한 0~39점 (REJECT) 기준]

메타데이터 불일치: 텍스트/사진이 [제출된 아티스트]나 [카테고리]와 전혀 무관한 경우.

어뷰징: 'ㅋㅋㅋㅋ', 'ㅇㅇㅇ' 등 의미 없는 자음/모음 도배, 타 사이트 광고, 무의미한 복사+붙여넣기.

심각한 규정 위반: 아티스트에 대한 심각한 명예훼손, 욕설, 성인물, 사회적 논란을 조장하는 악의적 게시물.

[⚠️ AI 심사역의 절대 주의사항 (팩트 체크 금지)]

당신은 최신 인터넷 정보에 대한 실시간 검색 능력이 없습니다. 따라서 사용자가 작성한 아티스트의 앨범 발매일, 성과, 차트 기록, 활동 내역에 대해 당신의 과거 지식을 기준으로 "허위 사실"이나 "망상"이라고 임의로 팩트 체크하고 감점하지 마십시오.

팬덤 커뮤니티 특성상 루머, 기대감, 비공식 정보가 포함될 수 있습니다. 악의적인 명예훼손이나 스팸이 아니라면, 글의 사실 여부보다는 **'아티스트에 대한 정성과 맥락의 일치도'**만을 평가하여 관대하게 APPROVE(60점 이상) 처리하십시오.

[애매한 40~59점 (REVIEW) 기준]

아티스트와 관련은 있으나, 글이 단 한두 단어로 너무 성의가 없거나 사진의 화질/내용이 판별하기 어려운 경우.

비판적인 의견이 담겨 있어 악플인지 정당한 비판인지 사람의 수동 판단이 필요한 경우.

[관대한 60~100점 (APPROVE) 기준]

팬심 인정: 글이 짧거나 문법이 완벽하지 않아도, 아티스트를 향한 순수한 응원, 일상적인 감상, 앓는 글 등 진정성이 보이면 승인합니다.

카테고리 부합: 스트리밍 인증, 굿즈 구매 등 해당 카테고리 목적에 맞는 사진과 글이 포함된 경우 점수를 부여합니다.

[결과 산출 기준]

score: 위 기준에 따른 0~100점.

recommendation: 점수 구간에 따라 "REJECT", "REVIEW", "APPROVE" 중 택 1.

suggested_vibe: APPROVE 구간(60점 이상)일 경우 글의 정성과 사진 퀄리티에 비례하여 10~100 사이의 숫자를 제안. REJECT나 REVIEW 구간은 0으로 고정.

반드시 JSON만 반환하라. 마크다운/설명문 금지.
JSON 스키마:
{
  "score": number,
  "recommendation": "APPROVE" | "REVIEW" | "REJECT",
  "suggested_vibe": number,
  "pros": string[],
  "cons": string[],
  "reasoning": string
}
`;

function mimeTypeForGeminiInline(url: string, contentType: string | null): string {
  const normalizedType = (contentType ?? "").toLowerCase();
  if (normalizedType.includes("image/png")) return "image/png";
  if (normalizedType.includes("image/webp")) return "image/webp";
  if (normalizedType.includes("image/gif")) return "image/gif";
  if (normalizedType.includes("image/jpeg") || normalizedType.includes("image/jpg")) return "image/jpeg";
  try {
    const parsed = new URL(url);
    const ext = parsed.pathname.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  } catch {
    // noop
  }
  return "image/jpeg";
}

async function fetchImageUrlsAsGeminiInlineParts(
  imageUrls: string[]
): Promise<
  | { ok: true; parts: { inlineData: { mimeType: string; data: string } }[] }
  | { ok: false; error: string }
> {
  const parts: { inlineData: { mimeType: string; data: string } }[] = [];
  for (const url of imageUrls) {
    let res: Response;
    try {
      res = await fetch(url, { method: "GET", cache: "no-store" });
    } catch {
      return { ok: false, error: "첨부 이미지를 불러오는 중 네트워크 오류가 발생했습니다." };
    }
    if (!res.ok) {
      return { ok: false, error: `첨부 이미지 다운로드에 실패했습니다. (status: ${res.status})` };
    }
    const contentType = res.headers.get("content-type");
    if (!contentType?.toLowerCase().startsWith("image/")) {
      return { ok: false, error: "첨부 URL 중 이미지가 아닌 응답이 포함되어 있습니다." };
    }
    const mimeType = mimeTypeForGeminiInline(url, contentType);
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString("base64");
    parts.push({ inlineData: { mimeType, data } });
  }
  return { ok: true, parts };
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

async function mirrorExternalActivityImages(params: {
  imageUrls: string[];
  projectUrl: string | undefined;
  accessToken: string;
  userId: string;
}): Promise<{ ok: true; urls: string[] } | { ok: false; status: number; error: string }> {
  const { imageUrls, projectUrl, accessToken, userId } = params;
  if (imageUrls.length === 0) return { ok: true, urls: [] };
  if (!projectUrl) {
    return { ok: false, status: 503, error: "이미지 미러링용 Supabase URL이 없습니다." };
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return { ok: false, status: 503, error: "이미지 미러링용 Supabase 키가 없습니다." };
  }

  const authedSupabase: SupabaseClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const urls: string[] = [];
  for (const imageUrl of imageUrls) {
    if (isAllowedActivityImageUrl(imageUrl, projectUrl)) {
      urls.push(imageUrl);
      continue;
    }
    let externalResponse: Response;
    try {
      externalResponse = await fetch(imageUrl, { method: "GET", cache: "no-store" });
    } catch {
      return { ok: false, status: 502, error: "외부 이미지 다운로드 중 네트워크 오류가 발생했습니다." };
    }
    if (!externalResponse.ok) {
      return {
        ok: false,
        status: 502,
        error: `외부 이미지 다운로드에 실패했습니다. (status: ${externalResponse.status})`,
      };
    }
    const contentType = externalResponse.headers.get("content-type");
    if (!contentType?.toLowerCase().startsWith("image/")) {
      return { ok: false, status: 400, error: "이미지 형식이 아닌 URL이 포함되어 있습니다." };
    }
    const bytes = await externalResponse.arrayBuffer();
    const ext = inferImageExtension(imageUrl, contentType);
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await authedSupabase.storage
      .from(ACTIVITY_IMAGES_BUCKET)
      .upload(path, bytes, {
        cacheControl: "3600",
        upsert: false,
        contentType,
      });
    if (uploadError) {
      return {
        ok: false,
        status: 502,
        error: `외부 이미지 미러링 업로드에 실패했습니다. (${uploadError.message})`,
      };
    }
    const { data: publicData } = authedSupabase.storage.from(ACTIVITY_IMAGES_BUCKET).getPublicUrl(path);
    urls.push(publicData.publicUrl);
  }
  return { ok: true, urls };
}

function recommendationForScore(score: number): AiRecommendation {
  if (score >= 60) return "APPROVE";
  if (score >= 40) return "REVIEW";
  return "REJECT";
}

async function fetchArtistAndActivityTypeNames(
  client: SupabaseClient,
  artistId: string,
  activityTypeId: string
): Promise<{ artistName: string; activityTypeName: string }> {
  const [artistRes, typeRes] = await Promise.all([
    client.from("artists").select("name").eq("id", artistId).maybeSingle(),
    client.from("activity_types").select("name").eq("id", activityTypeId).maybeSingle(),
  ]);
  if (artistRes.error) console.warn("[AI 심사] artists 조회 경고:", artistRes.error.message);
  if (typeRes.error) console.warn("[AI 심사] activity_types 조회 경고:", typeRes.error.message);
  const artistName =
    typeof artistRes.data?.name === "string" && artistRes.data.name.trim()
      ? artistRes.data.name.trim()
      : "(이름 미확인)";
  const activityTypeName =
    typeof typeRes.data?.name === "string" && typeRes.data.name.trim()
      ? typeRes.data.name.trim()
      : "(카테고리 미확인)";
  return { artistName, activityTypeName };
}

function createAiReviewLookupClient(accessToken: string): SupabaseClient | null {
  if (hasSupabaseServiceRoleConfig()) {
    return createSupabaseServiceRoleClient();
  }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!projectUrl || !anonKey) return null;
  return createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeAiEvaluation(raw: unknown): AiEvaluationResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scoreRaw = typeof obj.score === "number" ? obj.score : Number(obj.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const recommendation = recommendationForScore(score);
  const vibeRaw =
    typeof obj.suggested_vibe === "number" ? obj.suggested_vibe : Number(obj.suggested_vibe);
  let suggested_vibe = Number.isFinite(vibeRaw) ? Math.round(vibeRaw) : 0;
  if (recommendation === "APPROVE") {
    suggested_vibe = Number.isFinite(vibeRaw)
      ? Math.max(10, Math.min(100, Math.round(vibeRaw)))
      : Math.max(10, Math.min(100, score));
  } else {
    suggested_vibe = 0;
  }
  const pros = Array.isArray(obj.pros)
    ? obj.pros.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const cons = Array.isArray(obj.cons)
    ? obj.cons.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning.trim() : "";
  return { score, recommendation, suggested_vibe, pros, cons, reasoning };
}

async function evaluateWithGemini(params: {
  content: string;
  rawContent: string;
  imageUrls?: string[];
  artistId: string;
  activityTypeId: string;
  lookupClient: SupabaseClient;
}): Promise<{ ok: true; result: AiEvaluationResult } | { ok: false; error: string }> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "GEMINI_API_KEY 가 설정되지 않았습니다." };
    }
    const { artistName, activityTypeName } = await fetchArtistAndActivityTypeNames(
      params.lookupClient,
      params.artistId,
      params.activityTypeId
    );
    const imageUrls = params.imageUrls ?? [];
    const inlineResult =
      imageUrls.length > 0 ? await fetchImageUrlsAsGeminiInlineParts(imageUrls) : { ok: true as const, parts: [] };
    if (!inlineResult.ok) {
      return { ok: false, error: inlineResult.error };
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const contextualLead = `[제출된 아티스트: ${artistName}, 제출된 카테고리: ${activityTypeName}]\n\n[사용자 작성 본문]\n${params.content}`;
    const metaJson = JSON.stringify(
      {
        raw_content: params.rawContent,
        image_count: imageUrls.length,
        instruction:
          "위에 제시된 제출 메타데이터·본문과 함께 제공된 첨부 이미지(있는 경우)를 모두 반영하여, 시스템 지시의 심사 가이드·점수 구간·추천 바이브 규칙에 맞춰 JSON 스키마대로만 반환하라.",
      },
      null,
      2
    );
    const prompt = `${contextualLead}\n\n${metaJson}`;
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
      { text: prompt },
      ...inlineResult.parts,
    ];
    let response: Awaited<ReturnType<typeof model.generateContent>>;
    try {
      response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
        systemInstruction: AI_REVIEW_SYSTEM_PROMPT,
      });
    } catch {
      console.warn("[메인 모델 실패, Lite 모델로 Fallback 시도 중...]");
      const fallbackModel = genAI.getGenerativeModel({ model: GEMINI_FALLBACK_MODEL });
      response = await fallbackModel.generateContent({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
        systemInstruction: AI_REVIEW_SYSTEM_PROMPT,
      });
    }
    const rawText = response.response.text();
    console.log("[Gemini 원본 텍스트]:", rawText);
    const parsed = JSON.parse(rawText) as unknown;
    return { ok: true, result: normalizeAiEvaluation(parsed) };
  } catch (error) {
    console.error("[AI 심사 치명적 에러]:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Gemini 심사 호출에 실패했습니다.",
    };
  }
}

async function persistAiEvaluation(params: {
  supabase: ReturnType<typeof createSupabaseAnonClient>;
  logId: string;
  rawContent: string;
  evaluation: AiEvaluationResult;
}) {
  const { supabase, logId, rawContent, evaluation } = params;
  const payload = {
    raw_content: rawContent,
    ai_evaluation: evaluation,
    ai_score: evaluation.score,
  };

  const { error } = await supabase.from("activity_logs").update(payload).eq("id", logId);
  if (!error) return;

  const lower = `${error.message} ${error.details ?? ""}`.toLowerCase();
  const aiScoreMissing = lower.includes("ai_score") && (lower.includes("column") || lower.includes("does not exist"));
  if (aiScoreMissing) {
    await supabase
      .from("activity_logs")
      .update({
        raw_content: rawContent,
        ai_evaluation: evaluation,
      })
      .eq("id", logId);
  }
}

async function persistAiEvaluationAiOnly(params: {
  supabase: SupabaseClient;
  logId: string;
  evaluation: AiEvaluationResult;
}) {
  const { supabase, logId, evaluation } = params;
  const payload = {
    ai_evaluation: evaluation,
    ai_score: evaluation.score,
  };

  const { error } = await supabase.from("activity_logs").update(payload).eq("id", logId);
  if (!error) return;

  const lower = `${error.message} ${error.details ?? ""}`.toLowerCase();
  const aiScoreMissing = lower.includes("ai_score") && (lower.includes("column") || lower.includes("does not exist"));
  if (aiScoreMissing) {
    await supabase.from("activity_logs").update({ ai_evaluation: evaluation }).eq("id", logId);
  }
}

function scheduleActivityLogAiReview(params: {
  logId: string;
  content: string;
  rawContent: string;
  accessToken: string;
  imageUrls: string[];
  artistId: string;
  activityTypeId: string;
}) {
  const { logId, content, rawContent, accessToken, imageUrls, artistId, activityTypeId } = params;
  after(async () => {
    try {
      const lookupClient = createAiReviewLookupClient(accessToken);
      if (!lookupClient) {
        console.error("[background AI] 아티스트/카테고리 조회용 Supabase 클라이언트를 만들 수 없습니다.");
        return;
      }
      const aiResult = await evaluateWithGemini({
        content,
        rawContent,
        imageUrls,
        artistId,
        activityTypeId,
        lookupClient,
      });
      if (!aiResult.ok) {
        console.error("[background AI 심사 실패]", aiResult.error);
        return;
      }

      if (hasSupabaseServiceRoleConfig()) {
        await persistAiEvaluationAiOnly({
          supabase: createSupabaseServiceRoleClient(),
          logId,
          evaluation: aiResult.result,
        });
        return;
      }

      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!projectUrl || !anonKey) {
        console.error("[background AI] Supabase 환경 변수가 없습니다.");
        return;
      }
      const authed = createClient(projectUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await persistAiEvaluationAiOnly({
        supabase: authed,
        logId,
        evaluation: aiResult.result,
      });
    } catch (error) {
      console.error("[background AI 심사]", error);
    }
  });
}

function mapInsertError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("unique_proof_url")) {
    return "등록 처리 중입니다.";
  }
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
    return "이미 등록된 글입니다.";
  }
  return message;
}

async function reviveRejectedProofLog(params: {
  supabase: ReturnType<typeof createSupabaseAnonClient>;
  userId: string;
  targetId: string;
  proofUrl: string;
  content: string;
  rawContent: string;
  imageUrls: string[];
}): Promise<
  | { ok: true; id: string | null; revivedStatus: "pending" }
  | { ok: false; status: number; error: string }
> {
  const { supabase, userId, targetId, proofUrl, content, rawContent, imageUrls } = params;

  const { data: updated, error: updateError } = await supabase
    .from("activity_logs")
    .update({
      content,
      raw_content: rawContent,
      proof_url: proofUrl,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      status: "pending",
      deleted_at: null,
    })
    .eq("id", targetId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return { ok: false, status: 400, error: mapInsertError(updateError.message) };
  }
  if (!updated?.id) {
    return {
      ok: false,
      status: 403,
      error: "본인이 등록한 반려 건만 다시 제출할 수 있습니다.",
    };
  }

  return { ok: true, id: updated.id, revivedStatus: "pending" };
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
    const rawContent = (body.raw_content ?? "").trim() || content;
    const rawProofUrl = body.proof_url;
    const proofUrl = normalizeProofUrl(rawProofUrl ?? null);
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const imageUrlsResult = normalizeImageUrls(body.image_urls, projectUrl);
    if (!imageUrlsResult.ok) {
      return NextResponse.json({ ok: false, error: imageUrlsResult.error }, { status: 400 });
    }
    const imageUrls = imageUrlsResult.urls;

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
    if (typeof rawProofUrl === "string" && rawProofUrl.trim().length > 0 && !proofUrl) {
      return NextResponse.json(
        { ok: false, error: "proof_url 값이 비어 있거나 올바르지 않습니다." },
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
    const mirroredImageUrls = await mirrorExternalActivityImages({
      imageUrls,
      projectUrl,
      accessToken,
      userId: user.id,
    });
    if (!mirroredImageUrls.ok) {
      return NextResponse.json({ ok: false, error: mirroredImageUrls.error }, { status: mirroredImageUrls.status });
    }
    const safeImageUrls = mirroredImageUrls.urls;

    if (proofUrl) {
      if (!hasSupabaseServiceRoleConfig()) {
        return NextResponse.json(
          { ok: false, error: "서비스 롤 설정이 없어 중복 검사를 수행할 수 없습니다." },
          { status: 503 }
        );
      }
      const supabaseServiceRole = createSupabaseServiceRoleClient();
      const { data: existed, error: duplicateCheckError } = await supabaseServiceRole
        .from("activity_logs")
        .select("id, status, user_id")
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
        if (existed.status === "approved" || existed.status === "deleted") {
          return NextResponse.json(
            {
              ok: false,
              error: "이미 인증 완료된 트윗입니다. 삭제 후 재등록은 불가능합니다.",
            },
            { status: 400 }
          );
        }
        if (existed.status === "pending") {
          return NextResponse.json(
            { ok: false, error: "이미 심사 대기 중인 트윗입니다." },
            { status: 400 }
          );
        }
        if (existed.status === "rejected") {
          if (existed.user_id !== user.id) {
            return NextResponse.json(
              { ok: false, error: "이미 등록된 글입니다." },
              { status: 400 }
            );
          }
          const revived = await reviveRejectedProofLog({
            supabase,
            userId: user.id,
            targetId: existed.id,
            proofUrl,
            content,
            rawContent,
            imageUrls: safeImageUrls,
          });
          if (!revived.ok) {
            return NextResponse.json({ ok: false, error: revived.error }, { status: revived.status });
          }
          if (revived.id) {
            scheduleActivityLogAiReview({
              logId: revived.id,
              content,
              rawContent,
              accessToken,
              imageUrls: safeImageUrls,
              artistId,
              activityTypeId,
            });
          }
          return NextResponse.json({ success: true });
        }
        return NextResponse.json(
          { ok: false, error: "이미 등록된 글입니다." },
          { status: 400 }
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
        raw_content: rawContent,
        proof_url: proofUrl,
        image_urls: safeImageUrls.length > 0 ? safeImageUrls : null,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const lowerDetails = `${insertError.message} ${insertError.details ?? ""}`.toLowerCase();
        const isProofUrlConflict =
          lowerDetails.includes("proof_url") || lowerDetails.includes("unique_proof_url");
        if (proofUrl && isProofUrlConflict) {
          const lookupClient = hasSupabaseServiceRoleConfig()
            ? createSupabaseServiceRoleClient()
            : supabase;
          const { data: duplicated, error: duplicateLookupError } = await lookupClient
            .from("activity_logs")
            .select("id, status")
            .eq("proof_url", proofUrl)
            .limit(1)
            .maybeSingle();
          if (duplicateLookupError) {
            return NextResponse.json({ ok: false, error: duplicateLookupError.message }, { status: 500 });
          }
          if (duplicated?.status === "pending") {
            return NextResponse.json({ ok: false, error: "이미 심사 대기 중인 트윗입니다." }, { status: 400 });
          }
          if (duplicated?.status === "deleted" || duplicated?.status === "approved") {
            return NextResponse.json(
              { ok: false, error: "이미 인증 완료된 트윗입니다. 삭제 후 재등록은 불가능합니다." },
              { status: 400 }
            );
          }
        }
        return NextResponse.json({ ok: false, error: "등록 처리 중입니다." }, { status: 400 });
      }
      return NextResponse.json(
        { ok: false, error: mapInsertError(insertError.message) },
        { status: 400 }
      );
    }

    const savedId = inserted?.id ?? null;
    if (!savedId) {
      return NextResponse.json(
        { ok: false, error: "저장 후 식별자를 확인할 수 없습니다." },
        { status: 500 }
      );
    }

    scheduleActivityLogAiReview({
      logId: savedId,
      content,
      rawContent,
      accessToken,
      imageUrls: safeImageUrls,
      artistId,
      activityTypeId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "등록 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const accessToken = extractAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "인증 토큰이 없습니다. 다시 로그인해 주세요." },
        { status: 401 }
      );
    }

    let body: DeleteBody = {};
    try {
      body = (await request.json()) as DeleteBody;
    } catch {
      body = {};
    }
    const logId = (body.id ?? "").trim();
    if (!logId) {
      return NextResponse.json({ ok: false, error: "삭제할 활동 ID가 필요합니다." }, { status: 400 });
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

    const { data: updated, error: updateError } = await supabase
      .from("activity_logs")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", logId)
      .eq("user_id", user.id)
      .neq("status", "deleted")
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: mapInsertError(updateError.message) },
        { status: 400 }
      );
    }
    if (!updated?.id) {
      return NextResponse.json(
        { ok: false, error: "삭제할 활동을 찾을 수 없거나 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: updated.id,
      message: "활동이 삭제 처리되었습니다.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "삭제 처리 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const accessToken = extractAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "인증 토큰이 없습니다. 다시 로그인해 주세요." },
        { status: 401 }
      );
    }

    let body: UpdateBody = {};
    try {
      body = (await request.json()) as UpdateBody;
    } catch {
      body = {};
    }
    const logId = (body.id ?? "").trim();
    const content = (body.content ?? "").trim();
    const rawContent = (body.raw_content ?? "").trim() || content;
    if (!logId) {
      return NextResponse.json({ ok: false, error: "수정할 활동 ID가 필요합니다." }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ ok: false, error: "인증 내용을 입력해 주세요." }, { status: 400 });
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

    const { data: existing, error: existingError } = await supabase
      .from("activity_logs")
      .select("id, user_id, proof_url, artist_id, activity_type_id")
      .eq("id", logId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 400 });
    }
    if (!existing?.id) {
      return NextResponse.json(
        { ok: false, error: "수정할 활동을 찾을 수 없거나 권한이 없습니다." },
        { status: 404 }
      );
    }

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const imageUrlsResult = normalizeImageUrls(body.image_urls, projectUrl);
    if (!imageUrlsResult.ok) {
      return NextResponse.json({ ok: false, error: imageUrlsResult.error }, { status: 400 });
    }
    const imageUrls = imageUrlsResult.urls;

    const { data: updated, error: updateError } = await supabase
      .from("activity_logs")
      .update({
        content,
        raw_content: rawContent,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
        status: "pending",
        deleted_at: null,
      })
      .eq("id", logId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ ok: false, error: mapInsertError(updateError.message) }, { status: 400 });
    }
    if (!updated?.id) {
      return NextResponse.json(
        { ok: false, error: "수정할 활동을 찾을 수 없거나 권한이 없습니다." },
        { status: 404 }
      );
    }

    const patchLookupClient = createAiReviewLookupClient(accessToken);
    if (!patchLookupClient) {
      return NextResponse.json(
        { ok: false, error: "AI 심사용 환경 설정이 올바르지 않습니다." },
        { status: 503 }
      );
    }
    const artistIdPatch = typeof existing.artist_id === "string" ? existing.artist_id : "";
    const activityTypeIdPatch = typeof existing.activity_type_id === "string" ? existing.activity_type_id : "";
    if (!artistIdPatch || !activityTypeIdPatch) {
      return NextResponse.json(
        { ok: false, error: "활동에 연결된 아티스트 또는 카테고리 정보를 찾을 수 없습니다." },
        { status: 400 }
      );
    }
    const aiResult = await evaluateWithGemini({
      content,
      rawContent,
      imageUrls,
      artistId: artistIdPatch,
      activityTypeId: activityTypeIdPatch,
      lookupClient: patchLookupClient,
    });
    if (aiResult.ok) {
      await persistAiEvaluation({
        supabase,
        logId: updated.id,
        rawContent,
        evaluation: aiResult.result,
      });
    } else {
      await persistAiEvaluation({
        supabase,
        logId: updated.id,
        rawContent,
        evaluation: {
          score: 0,
          recommendation: "REJECT",
          suggested_vibe: 0,
          pros: [],
          cons: ["AI 심사 실패"],
          reasoning: aiResult.error,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      id: updated.id,
      message: "수정이 저장되어 재심사 대기 상태가 되었습니다.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "수정 처리 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
