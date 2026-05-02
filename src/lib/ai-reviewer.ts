import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiRecommendation = "APPROVE" | "REVIEW" | "REJECT";

export type AiEvaluationResult = {
  score: number;
  recommendation: AiRecommendation;
  suggested_vibe: number;
  pros: string[];
  cons: string[];
  reasoning: string;
};

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

function recommendationForScore(score: number): AiRecommendation {
  if (score >= 60) return "APPROVE";
  if (score >= 40) return "REVIEW";
  return "REJECT";
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

export type EvaluateActivityInput = {
  content: string;
  /** 생략 시 content와 동일하게 사용 */
  rawContent?: string;
  imageUrls: string[];
  artistName: string;
  categoryName: string;
};

export type EvaluateActivityOutcome =
  | { ok: true; result: AiEvaluationResult }
  | { ok: false; error: string };

/**
 * 활동 로그 AI 심사: 멀티모달(이미지) + Gemini Flash(실패 시 Flash-Lite 폴백).
 */
export async function evaluateActivity(input: EvaluateActivityInput): Promise<EvaluateActivityOutcome> {
  const rawContent = input.rawContent ?? input.content;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "GEMINI_API_KEY 가 설정되지 않았습니다." };
    }
    const imageUrls = input.imageUrls ?? [];
    const inlineResult =
      imageUrls.length > 0 ? await fetchImageUrlsAsGeminiInlineParts(imageUrls) : { ok: true as const, parts: [] };
    if (!inlineResult.ok) {
      return { ok: false, error: inlineResult.error };
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const contextualLead = `[제출된 아티스트: ${input.artistName}, 제출된 카테고리: ${input.categoryName}]\n\n[사용자 작성 본문]\n${input.content}`;
    const metaJson = JSON.stringify(
      {
        raw_content: rawContent,
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
