"use client";

import type { ChangeEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AiReviewReportCard } from "./components/AiReviewReportCard";
import type { AiRecommendation, ParsedAiEvaluation } from "./components/types";
import { UserSubmissionCard } from "./components/UserSubmissionCard";

type LogDetail = {
  id: string;
  status: string;
  content: string;
  raw_content: string;
  proof_url: string | null;
  image_urls: string[];
  ai_evaluation: Record<string, unknown> | null;
  ai_score: number | null;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};

function recommendationFromScore(score: number): AiRecommendation {
  if (score >= 60) return "APPROVE";
  if (score >= 40) return "REVIEW";
  return "REJECT";
}

function parseAiEvaluation(raw: Record<string, unknown> | null): ParsedAiEvaluation {
  const scoreRaw = typeof raw?.score === "number" ? raw.score : Number(raw?.score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const recRaw = typeof raw?.recommendation === "string" ? raw.recommendation.trim().toUpperCase() : "";
  const recommendation: AiRecommendation =
    recRaw === "APPROVE" || recRaw === "REVIEW" || recRaw === "REJECT" ? recRaw : recommendationFromScore(score);
  const vibeRaw =
    typeof raw?.suggested_vibe === "number" ? raw.suggested_vibe : Number(raw?.suggested_vibe ?? NaN);
  const suggested_vibe = Number.isFinite(vibeRaw) ? Math.round(vibeRaw) : 0;
  return {
    score,
    recommendation,
    suggested_vibe,
    pros: Array.isArray(raw?.pros) ? raw.pros.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [],
    cons: Array.isArray(raw?.cons) ? raw.cons.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [],
    reasoning: typeof raw?.reasoning === "string" ? raw.reasoning : "",
  };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function AdminActivityReviewClient() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogDetail | null>(null);
  const [finalVibe, setFinalVibe] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/activity-logs/${encodeURIComponent(id)}`, { headers });
      const body = (await response.json()) as { ok?: boolean; error?: string; log?: LogDetail };
      if (cancelled) return;
      if (!response.ok || !body.ok || !body.log) setError(body.error ?? "심사 상세를 불러오지 못했습니다.");
      else setLog(body.log);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const ai = useMemo(() => parseAiEvaluation(log?.ai_evaluation ?? null), [log?.ai_evaluation]);

  useEffect(() => {
    if (!log) return;
    setFinalVibe(parseAiEvaluation(log.ai_evaluation).suggested_vibe);
  }, [log]);

  const handleFinalVibeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setFinalVibe(0);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setFinalVibe(Math.max(0, Math.min(1_000_000, Math.floor(n))));
  };

  const actApprove = async () => {
    if (!log) return;
    setActing(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/activity-logs/${encodeURIComponent(log.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        status: "approved",
        rewarded_vibe: finalVibe,
        ai_evaluation: log.ai_evaluation,
      }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    setActing(false);
    if (!res.ok || !body.ok) return toast.error(body.error ?? "승인 처리에 실패했습니다.");
    toast.success("승인 완료");
    router.replace("/admin");
  };

  const actReject = async () => {
    if (!log) return;
    setActing(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/activity-logs/${encodeURIComponent(log.id)}/reject`, { method: "POST", headers });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    setActing(false);
    if (!res.ok || !body.ok) return toast.error(body.error ?? "반려 처리에 실패했습니다.");
    toast.success("반려 완료");
    router.replace("/admin");
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-400">불러오는 중…</div>;
  if (error || !log) return <div className="min-h-screen bg-zinc-950 px-6 py-10 text-red-300">{error ?? "데이터 없음"}</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm text-zinc-400">관리자 AI 심사 상세</span>
          <Link href="/admin" className="text-sm text-zinc-400 hover:text-white">
            목록으로
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <UserSubmissionCard
            nickname={log.profiles?.nickname?.trim() || "익명"}
            categoryLabel={log.activity_types?.name ?? "활동"}
            content={log.content}
            imageUrls={log.image_urls}
            proofUrl={log.proof_url}
          />
          <AiReviewReportCard
            ai={ai}
            displayScore={log.ai_score ?? ai.score}
            finalVibe={finalVibe}
            onFinalVibeChange={handleFinalVibeChange}
            finalVibeDisabled={acting || log.status !== "pending"}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={acting}
            onClick={() => void actReject()}
            className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm"
          >
            <XCircle className="h-4 w-4" />
            반려
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => void actApprove()}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-4 py-2 text-sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            승인
          </button>
        </div>
        {log.status !== "pending" ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            현재 상태가 pending이 아닙니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}
