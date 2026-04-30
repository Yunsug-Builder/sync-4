import { NextResponse } from "next/server";
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

type AiEvaluationResult = {
  score: number;
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
당신은 SYNC 서비스의 관리자 전용 AI 심사 보조 엔진이다.
사용자 게시글의 품질을 냉정하고 엄격하게 평가하라.

평가 기준(총 100점):
1) 아티스트 관련성: 40점
2) 글의 정성(구체성/맥락/완성도): 40점
3) 독창성(개인 경험/차별성): 20점

반드시 JSON만 반환하라. 마크다운/설명문 금지.
JSON 스키마:
{
  "score": number,         // 0~100 정수
  "pros": string[],        // 강점
  "cons": string[],        // 약점
  "reasoning": string      // 점수 근거 요약
}
`;

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

function normalizeAiEvaluation(raw: unknown): AiEvaluationResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scoreRaw = typeof obj.score === "number" ? obj.score : Number(obj.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const pros = Array.isArray(obj.pros)
    ? obj.pros.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const cons = Array.isArray(obj.cons)
    ? obj.cons.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : [];
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning.trim() : "";
  return { score, pros, cons, reasoning };
}

async function evaluateWithGemini(params: {
  content: string;
  rawContent: string;
}): Promise<{ ok: true; result: AiEvaluationResult } | { ok: false; error: string }> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "GEMINI_API_KEY 가 설정되지 않았습니다." };
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = JSON.stringify(
      {
        content: params.content,
        raw_content: params.rawContent,
        instruction:
          "위 데이터를 기준으로 점수와 pros/cons/reasoning을 JSON으로 반환하라.",
      },
      null,
      2
    );
    let response: Awaited<ReturnType<typeof model.generateContent>>;
    try {
      response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
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
            parts: [{ text: prompt }],
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
  evaluation:
    | AiEvaluationResult
    | {
        score: number;
        pros: string[];
        cons: string[];
        reasoning: string;
      };
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
          return NextResponse.json({
            ok: true,
            id: revived.id,
            message: "반려된 활동을 수정하여 다시 심사 대기 상태로 등록했습니다.",
          });
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
        status: "pending",
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
    if (savedId) {
      const aiResult = await evaluateWithGemini({ content, rawContent });
      if (aiResult.ok) {
        await persistAiEvaluation({
          supabase,
          logId: savedId,
          rawContent,
          evaluation: aiResult.result,
        });
      } else {
        await persistAiEvaluation({
          supabase,
          logId: savedId,
          rawContent,
          evaluation: {
            score: 0,
            pros: [],
            cons: ["AI 심사 실패"],
            reasoning: aiResult.error,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      id: savedId,
      message: "활동 인증이 등록되었습니다.",
    });
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
      .select("id, user_id, proof_url")
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

    const aiResult = await evaluateWithGemini({ content, rawContent });
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
