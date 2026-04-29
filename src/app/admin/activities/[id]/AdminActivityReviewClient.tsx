"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Link2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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

function parseAiEvaluation(raw: Record<string, unknown> | null) {
  const scoreRaw = typeof raw?.score === "number" ? raw.score : Number(raw?.score ?? 0);
  return {
    score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0,
    pros: Array.isArray(raw?.pros) ? raw.pros.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [],
    cons: Array.isArray(raw?.cons) ? raw.cons.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [],
    reasoning: typeof raw?.reasoning === "string" ? raw.reasoning : "",
  };
}

async function getHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminActivityReviewClient() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const headers = await getHeaders();
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

  const actApprove = async () => {
    if (!log) return;
    setActing(true);
    const headers = await getHeaders();
    const res = await fetch(`/api/admin/activity-logs/${encodeURIComponent(log.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ final_vibes: log.activity_types?.base_vibes ?? 0, ai_evaluation: log.ai_evaluation }),
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
    const headers = await getHeaders();
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
          <Link href="/admin" className="text-sm text-zinc-400 hover:text-white">목록으로</Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><FileText className="h-5 w-5" />사용자 제출 내용</h2>
            <p className="mb-3 text-sm text-zinc-400">작성자: {log.profiles?.nickname?.trim() || "익명"} · 유형: {log.activity_types?.name ?? "활동"}</p>
            <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950 p-4 text-sm">{log.content || "내용 없음"}</p>
            {log.image_urls.length > 0 ? <div className="mt-4 grid grid-cols-2 gap-2">{log.image_urls.map((url) => <img key={url} src={url} alt="" className="h-40 w-full rounded-xl border border-white/10 object-cover" />)}</div> : null}
            {log.proof_url ? <a href={log.proof_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-sky-300"><Link2 className="h-4 w-4" />원본 트윗 링크 열기</a> : null}
          </section>
          <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-fuchsia-300" />AI 심사 리포트</h2>
            <div className="mb-6 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-5"><p className="text-xs text-zinc-400">총점</p><p className="text-5xl font-bold text-fuchsia-200">{log.ai_score ?? ai.score}</p></div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4"><h3 className="mb-2 font-medium text-emerald-200">장점</h3><ul className="list-disc space-y-1 pl-5 text-sm">{ai.pros.length ? ai.pros.map((p) => <li key={p}>{p}</li>) : <li>장점 데이터 없음</li>}</ul></div>
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4"><h3 className="mb-2 font-medium text-amber-200">단점</h3><ul className="list-disc space-y-1 pl-5 text-sm">{ai.cons.length ? ai.cons.map((c) => <li key={c}>{c}</li>) : <li>단점 데이터 없음</li>}</ul></div>
          </section>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={acting} onClick={() => void actReject()} className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm"><XCircle className="h-4 w-4" />반려</button>
          <button type="button" disabled={acting} onClick={() => void actApprove()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-4 py-2 text-sm"><CheckCircle2 className="h-4 w-4" />승인</button>
        </div>
        {log.status !== "pending" ? <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><AlertTriangle className="h-4 w-4" />현재 상태가 pending이 아닙니다.</div> : null}
      </div>
    </div>
  );
}

