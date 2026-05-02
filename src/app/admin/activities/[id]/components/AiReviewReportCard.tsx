"use client";

import type { ChangeEvent } from "react";
import { Sparkles } from "lucide-react";
import type { AiRecommendation, ParsedAiEvaluation } from "./types";

function RecommendationBadge({ recommendation }: { recommendation: AiRecommendation }) {
  const styles: Record<AiRecommendation, string> = {
    APPROVE: "border-emerald-400/45 bg-emerald-500/15 text-emerald-200",
    REVIEW: "border-amber-400/45 bg-amber-500/15 text-amber-200",
    REJECT: "border-red-400/45 bg-red-500/15 text-red-200",
  };
  const labels: Record<AiRecommendation, string> = {
    APPROVE: "승인 추천",
    REVIEW: "수동 검토",
    REJECT: "반려 추천",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight ${styles[recommendation]}`}
    >
      {labels[recommendation]}
    </span>
  );
}

export type AiReviewReportCardProps = {
  ai: ParsedAiEvaluation;
  displayScore: number;
  finalVibe: number;
  onFinalVibeChange: (e: ChangeEvent<HTMLInputElement>) => void;
  finalVibeDisabled: boolean;
};

export function AiReviewReportCard({
  ai,
  displayScore,
  finalVibe,
  onFinalVibeChange,
  finalVibeDisabled,
}: AiReviewReportCardProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="h-5 w-5 text-fuchsia-300" />
        AI 심사 리포트
      </h2>
      <div className="mb-6 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-5">
        <p className="text-xs text-zinc-400">총점</p>
        <p className="text-5xl font-bold text-fuchsia-200">{displayScore}</p>
        <div className="mt-5 grid gap-4 border-t border-fuchsia-400/20 pt-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">추천 액션</p>
            <RecommendationBadge recommendation={ai.recommendation} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">추천 바이브</p>
            <p className="text-2xl font-semibold tabular-nums text-fuchsia-100">{ai.suggested_vibe}</p>
            <p className="mt-1 text-[11px] text-zinc-500">AI 제안 지급 액수(참고)</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
        <h3 className="mb-2 font-medium text-emerald-200">장점</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {ai.pros.length ? ai.pros.map((p) => <li key={p}>{p}</li>) : <li>장점 데이터 없음</li>}
        </ul>
      </div>
      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
        <h3 className="mb-2 font-medium text-amber-200">단점</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {ai.cons.length ? ai.cons.map((c) => <li key={c}>{c}</li>) : <li>단점 데이터 없음</li>}
        </ul>
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/80 p-4">
        <label
          htmlFor="final-vibe-input"
          className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          최종 지급 바이브
        </label>
        <input
          id="final-vibe-input"
          type="number"
          min={0}
          max={1_000_000}
          step={1}
          value={finalVibe}
          disabled={finalVibeDisabled}
          onChange={onFinalVibeChange}
          className="w-full max-w-[12rem] rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm tabular-nums text-zinc-100 outline-none ring-fuchsia-400/40 focus:ring-2 disabled:opacity-50"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          AI 추천({ai.suggested_vibe})을 기본으로 하며, 승인 시 실제 지급액으로 반영됩니다.
        </p>
      </div>
    </section>
  );
}
