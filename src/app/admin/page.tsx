"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type PendingLog = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  source_type: string | null;
  external_url: string | null;
  ai_evaluation: Record<string, unknown> | null;
  raw_content: string | null;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};

type ApprovedLog = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  source_type: string | null;
  external_url: string | null;
  ai_evaluation: Record<string, unknown> | null;
  raw_content: string | null;
  view_count: number;
  is_settled: boolean;
  sync_count: number;
  estimated_bonus: number;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const [logs, setLogs] = useState<PendingLog[]>([]);
  const [approvedLogs, setApprovedLogs] = useState<ApprovedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApproved, setLoadingApproved] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [settlementRunning, setSettlementRunning] = useState(false);

  const loadApproved = useCallback(async () => {
    setLoadingApproved(true);
    const res = await fetch("/api/admin/approved-logs");
    const body = (await res.json()) as {
      ok?: boolean;
      logs?: ApprovedLog[];
      error?: string;
    };
    if (!res.ok || !body.ok) {
      setApprovedLogs([]);
      setLoadingApproved(false);
      return;
    }
    setApprovedLogs(body.logs ?? []);
    setLoadingApproved(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    const res = await fetch("/api/admin/pending-logs");
    const body = (await res.json()) as {
      ok?: boolean;
      logs?: PendingLog[];
      error?: string;
    };
    if (!res.ok || !body.ok) {
      setBanner(body.error ?? "목록을 불러오지 못했습니다.");
      setLogs([]);
      setLoading(false);
      return;
    }
    setLogs(body.logs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadApproved();
  }, [loadApproved]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void loadApproved();
    }, 8000);
    return () => window.clearInterval(t);
  }, [loadApproved]);

  const handleApprove = async (
    id: string,
    finalVibes: number,
    aiEvaluation: Record<string, unknown> | null
  ) => {
    setActingId(id);
    setBanner(null);
    const idKey = id.trim().toLowerCase();
    const res = await fetch(
      `/api/admin/activity-logs/${encodeURIComponent(id)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          final_vibes: finalVibes,
          ai_evaluation: aiEvaluation,
        }),
      }
    );
    let body: { ok?: boolean; error?: string; vibes_added?: number } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      body = {};
    }
    setActingId(null);

    const approved =
      res.ok &&
      (body.ok === true ||
        (typeof body.vibes_added === "number" && body.vibes_added >= 0));

    if (!approved) {
      setBanner(body.error ?? "승인 처리에 실패했습니다.");
      return;
    }

    setLogs((prev) =>
      prev.filter((l) => l.id.trim().toLowerCase() !== idKey)
    );
    void loadApproved();
  };

  const handleRunWeeklySettlement = async () => {
    setSettlementRunning(true);
    try {
      const res = await fetch("/api/admin/perform-weekly-settlement", {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "정산 실행에 실패했습니다.");
        return;
      }
      const n =
        typeof body.data === "number" && Number.isFinite(body.data)
          ? Math.max(0, Math.floor(body.data))
          : 0;
      if (n === 0) {
        toast.info("정산할 대상이 없습니다");
      } else {
        toast.success(`${n}명의 유저에게 VIBE 정산이 완료되었습니다`);
      }
      void loadApproved();
    } catch {
      toast.error("정산 요청 중 오류가 발생했습니다.");
    } finally {
      setSettlementRunning(false);
    }
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    setBanner(null);
    const res = await fetch(`/api/admin/activity-logs/${id}/reject`, {
      method: "POST",
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    setActingId(null);
    if (!res.ok || !body.ok) {
      setBanner(body.error ?? "거절 처리에 실패했습니다.");
      return;
    }
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              인증 대기 큐
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              제출된 활동을 검토하고 승인하면 유형별 기본 VIBE가 사용자에게 반영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={settlementRunning}
              onClick={() => void handleRunWeeklySettlement()}
              className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-4 py-1.5 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/25 disabled:opacity-50"
            >
              {settlementRunning ? "정산 실행 중…" : "주간 정산 강제 실행"}
            </button>
            <span className="rounded-full border border-white/10 bg-zinc-900/80 px-4 py-1.5 text-sm text-zinc-300">
              대기{" "}
              <span className="font-semibold text-white tabular-nums">{logs.length}</span>건
            </span>
            <Link
              href="/"
              className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white"
            >
              ← 메인
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {banner ? (
          <div
            className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            role="alert"
          >
            {banner}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-zinc-900/40 px-8 py-16 text-center">
            <p className="text-lg font-medium text-zinc-200">대기 중인 제출이 없습니다</p>
            <p className="mt-2 text-sm text-zinc-500">
              새 인증이 들어오면 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-3 font-medium">닉네임</th>
                    <th className="px-5 py-3 font-medium">활동 유형</th>
                    <th className="px-5 py-3 font-medium tabular-nums">VIBE</th>
                    <th className="px-5 py-3 font-medium">제출 내용</th>
                    <th className="px-5 py-3 font-medium">제출일</th>
                    <th className="px-5 py-3 font-medium text-right">처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.map((row) => {
                    const nickname = row.profiles?.nickname?.trim() || "—";
                    const typeName = row.activity_types?.name ?? "—";
                    const vibes = row.activity_types?.base_vibes ?? 0;
                    const busy = actingId === row.id;
                    return (
                      <tr key={row.id} className="align-top text-zinc-200">
                        <td className="px-5 py-4 font-medium text-white">{nickname}</td>
                        <td className="px-5 py-4 text-zinc-300">{typeName}</td>
                        <td className="px-5 py-4 tabular-nums text-sync-purple">
                          +{vibes}
                        </td>
                        <td className="max-w-md px-5 py-4 text-zinc-400">
                          <span className="line-clamp-3 whitespace-pre-wrap">
                            {row.content?.trim() || "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-zinc-500">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleReject(row.id)}
                              className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-50"
                            >
                              거절
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleApprove(
                                  row.id,
                                  row.activity_types?.base_vibes ?? 0,
                                  row.ai_evaluation
                                )
                              }
                              className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-zinc-950 transition hover:opacity-90 disabled:opacity-50"
                            >
                              {busy ? "처리 중…" : "승인"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="space-y-4 lg:hidden">
              {logs.map((row) => {
                const nickname = row.profiles?.nickname?.trim() || "—";
                const typeName = row.activity_types?.name ?? "—";
                const vibes = row.activity_types?.base_vibes ?? 0;
                const busy = actingId === row.id;
                return (
                  <li
                    key={row.id}
                    className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5 shadow-sm shadow-black/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{nickname}</p>
                        <p className="mt-1 text-sm text-zinc-400">{typeName}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-sync-purple/15 px-3 py-1 text-sm font-semibold tabular-nums text-sync-purple">
                        +{vibes} V
                      </span>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {row.content?.trim() || "—"}
                    </p>
                    <p className="mt-3 text-xs text-zinc-500">{formatDate(row.created_at)}</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReject(row.id)}
                        className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-50"
                      >
                        거절
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handleApprove(
                            row.id,
                            row.activity_types?.base_vibes ?? 0,
                            row.ai_evaluation
                          )
                        }
                        className="flex-1 rounded-xl bg-white py-2.5 text-sm font-medium text-zinc-950 transition hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? "처리 중…" : "승인"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <section className="mt-16 border-t border-white/10 pt-12">
          <h2 className="text-xl font-semibold text-white">승인된 활동 · 정산 모니터링</h2>
          <p className="mt-2 text-sm text-zinc-500">
            현재 Sync·조회 수를 반영한 예상 가중 보너스입니다. (Sync×5 + 조회÷10) 약 8초마다
            자동 갱신됩니다.
          </p>
          {loadingApproved ? (
            <p className="mt-6 text-sm text-zinc-500">불러오는 중…</p>
          ) : approvedLogs.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">승인된 활동이 없습니다.</p>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900/50">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-medium">닉네임</th>
                    <th className="px-4 py-3 font-medium">유형</th>
                    <th className="px-4 py-3 font-medium tabular-nums">기본</th>
                    <th className="px-4 py-3 font-medium tabular-nums">Sync</th>
                    <th className="px-4 py-3 font-medium tabular-nums">조회</th>
                    <th className="px-4 py-3 font-medium tabular-nums">예상 보너스</th>
                    <th className="px-4 py-3 font-medium">정산</th>
                    <th className="px-4 py-3 font-medium">제출일</th>
                    <th className="px-4 py-3 font-medium">내용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {approvedLogs.map((row) => {
                    const nickname = row.profiles?.nickname?.trim() || "—";
                    const typeName = row.activity_types?.name ?? "—";
                    const base = row.activity_types?.base_vibes ?? 0;
                    return (
                      <tr key={row.id} className="align-top text-zinc-200">
                        <td className="px-4 py-3 font-medium text-white">{nickname}</td>
                        <td className="px-4 py-3 text-zinc-400">{typeName}</td>
                        <td className="px-4 py-3 tabular-nums text-sync-purple">+{base}</td>
                        <td className="px-4 py-3 tabular-nums text-zinc-300">
                          {row.sync_count.toLocaleString("ko-KR")}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-300">
                          {row.view_count.toLocaleString("ko-KR")}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-medium text-fuchsia-200">
                          +{row.estimated_bonus.toLocaleString("ko-KR")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${
                              row.is_settled
                                ? "border-zinc-500/40 text-zinc-400"
                                : "border-amber-400/35 text-amber-100"
                            }`}
                          >
                            {row.is_settled ? "정산 완료" : "정산 예정"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-zinc-500">
                          <span className="line-clamp-2 whitespace-pre-wrap">
                            {row.content?.trim() || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
