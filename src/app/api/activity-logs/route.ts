import { after, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateActivity, type AiEvaluationResult } from "@/lib/ai-reviewer";
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
      const { artistName, activityTypeName } = await fetchArtistAndActivityTypeNames(
        lookupClient,
        artistId,
        activityTypeId
      );
      const aiResult = await evaluateActivity({
        content,
        rawContent,
        imageUrls,
        artistName,
        categoryName: activityTypeName,
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
    const { artistName, activityTypeName } = await fetchArtistAndActivityTypeNames(
      patchLookupClient,
      artistIdPatch,
      activityTypeIdPatch
    );
    const aiResult = await evaluateActivity({
      content,
      rawContent,
      imageUrls,
      artistName,
      categoryName: activityTypeName,
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
