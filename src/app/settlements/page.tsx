"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SETTLEMENT_HISTORY_BONUS_POINTS_COLUMN,
  SETTLEMENT_HISTORY_WEEK_START_COLUMN,
} from "@/lib/settlement-metadata";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function formatWeek(isoDate: string) {
  try {
    const d = new Date(isoDate + "T12:00:00");
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export default function SettlementsPage() {
  const [rows, setRows] = useState<
    { id: string; bonus_points: number; created_at: string; weekLabel: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    void (async () => {
      const week_start = SETTLEMENT_HISTORY_WEEK_START_COLUMN;
      const bonus_points = SETTLEMENT_HISTORY_BONUS_POINTS_COLUMN;

      setLoading(true);
      setError(null);

      if (!week_start?.trim() || !bonus_points?.trim()) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data, error: qErr } = await supabase
        .from("settlement_history")
        .select(`id, ${week_start}, ${bonus_points}, created_at`)
        .order(week_start, { ascending: false });

      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setRows([]);
      } else {
        const list = (data ?? []) as Record<string, unknown>[];
        setRows(
          list.map((r) => ({
            id: String(r.id),
            bonus_points: Number(r[bonus_points] ?? 0),
            created_at: String(r.created_at),
            weekLabel: String(r[week_start] ?? ""),
          }))
        );
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- module-level column names (fixed 2 deps)
  }, [SETTLEMENT_HISTORY_WEEK_START_COLUMN, SETTLEMENT_HISTORY_BONUS_POINTS_COLUMN]);

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <Link
          href="/profile"
          className="text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          ← 프로필
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-white">정산 이력</h1>
        <p className="mt-2 text-sm text-zinc-500">
          주차별로 확정·지급된 가중 보너스 포인트 내역입니다.
        </p>

        {loading ? (
          <p className="mt-10 text-sm text-zinc-500">불러오는 중…</p>
        ) : error ? (
          <p className="mt-10 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-10 text-sm text-zinc-500">아직 정산 이력이 없습니다.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-zinc-900/50 px-4 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    주 시작일 {formatWeek(r.weekLabel)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    기록일{" "}
                    {new Date(r.created_at).toLocaleString("ko-KR", {
                      dateStyle: "medium",
                    })}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-fuchsia-200">
                  +{r.bonus_points.toLocaleString("ko-KR")} pt
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
