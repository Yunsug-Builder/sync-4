export type AiRecommendation = "APPROVE" | "REVIEW" | "REJECT";

export type ParsedAiEvaluation = {
  score: number;
  recommendation: AiRecommendation;
  suggested_vibe: number;
  pros: string[];
  cons: string[];
  reasoning: string;
};
