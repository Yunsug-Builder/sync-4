"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type PendingLog = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  ai_evaluation: Record<string, unknown> | null;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};
type ApprovedLog = {
  id: string;
  content: string | null;
  created_at: string;
  view_count: number;
  is_settled: boolean;
  sync_count: number;
  estimated_bonus: number;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminDashboardClient() {
  const [logs, setLogs] = useState<PendingLog[]>([]);
  const [approvedLogs, setApprovedLogs] = useState<ApprovedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApproved, setLoadingApproved] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [settlementRunning, setSettlementRunning] = useState(false);

  const loadApproved = useCallback(async () => {
    setLoadingApproved(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/admin/approved-logs", { headers });
    const body = (await res.json()) as { ok?: boolean; logs?: ApprovedLog[] };
    setApprovedLogs(res.ok && body.ok ? body.logs ?? [] : []);
    setLoadingApproved(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/admin/pending-logs", { headers });
    const body = (await res.json()) as { ok?: boolean; logs?: PendingLog[]; error?: string };
    if (!res.ok || !body.ok) {
      setBanner(body.error ?? "목록을 불러오지 못했습니다.");
      setLogs([]);
    } else {
      setLogs(body.logs ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void loadApproved();
  }, [load, loadApproved]);

  const handleApprove = async (row: PendingLog) => {
    setActingId(row.id);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/activity-logs/${encodeURIComponent(row.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        final_vibes: row.activity_types?.base_vibes ?? 0,
        ai_evaluation: row.ai_evaluation,
      }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    setActingId(null);
    if (!res.ok || !body.ok) return setBanner(body.error ?? "승인 실패");
    setLogs((prev) => prev.filter((v) => v.id !== row.id));
    void loadApproved();
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/activity-logs/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers,
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    setActingId(null);
    if (!res.ok || !body.ok) return setBanner(body.error ?? "반려 실패");
    setLogs((prev) => prev.filter((v) => v.id !== id));
  };

  const handleSettlement = async () => {
    setSettlementRunning(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/admin/perform-weekly-settlement", { method: "POST", headers });
    const body = (await res.json()) as { ok?: boolean; data?: number; error?: string };
    setSettlementRunning(false);
    if (!res.ok || !body.ok) return toast.error(body.error ?? "정산 실패");
    toast.success(`${body.data ?? 0}명 정산 완료`);
    void loadApproved();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">인증 대기 큐</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => void handleSettlement()} disabled={settlementRunning} className="rounded border px-3 py-1 text-sm">{settlementRunning ? "정산 중…" : "정산 실행"}</button>
            <Link href="/" className="text-sm text-zinc-400">메인</Link>
          </div>
        </div>
        {banner ? <p className="mb-3 text-sm text-amber-200">{banner}</p> : null}
        {loading ? <p className="text-zinc-400">불러오는 중…</p> : (
          <ul className="space-y-3">
            {logs.map((row) => (
              <li key={row.id} className="rounded-xl border border-white/10 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm">{row.profiles?.nickname ?? "—"} · {row.activity_types?.name ?? "활동"}</div>
                  <Link className="text-xs text-zinc-400 underline" href={`/admin/activities/${encodeURIComponent(row.id)}`}>상세</Link>
                </div>
                <p className="whitespace-pre-wrap text-sm text-zinc-300">{row.content ?? "—"}</p>
                <p className="mt-2 text-xs text-zinc-500">{formatDate(row.created_at)}</p>
                <div className="mt-3 flex gap-2">
                  <button className="rounded border px-3 py-1 text-sm" disabled={actingId === row.id} onClick={() => void handleReject(row.id)}>반려</button>
                  <button className="rounded bg-white px-3 py-1 text-sm text-zinc-900" disabled={actingId === row.id} onClick={() => void handleApprove(row)}>승인</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8">
          <h2 className="mb-2 text-lg font-medium">승인 모니터링</h2>
          {loadingApproved ? <p className="text-sm text-zinc-500">불러오는 중…</p> : (
            <p className="text-sm text-zinc-400">승인된 활동 {approvedLogs.length}건</p>
          )}
        </div>
      </div>
    </div>
  );
}

