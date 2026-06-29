"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPostBreakdown,
  mergeDeletedGap,
  pickBestContributorId,
  sumBreakdownParts,
  type PostBreakdown,
  type SettlementHistoryRow,
  type WeekLineItem,
} from "@/components/settlements/settlement-report-types";
import {
  SETTLEMENT_HISTORY_BONUS_VIBES_COLUMN,
  SETTLEMENT_HISTORY_WEEK_START_COLUMN,
} from "@/lib/settlement-metadata";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  formatCalendarDateForDisplay,
  formatTimestampForDisplay,
  getUtcWeekRangeIso,
} from "@/lib/week-utils";

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type ActivitySyncCountRow = {
  activity_id: string;
  sync_count: number | string | null;
};

function toNonNegativeInteger(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export default function SettlementsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<SettlementHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** `null`: 이번 주 역산 로딩 전 */
  const [heroPosts, setHeroPosts] = useState<PostBreakdown[] | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weekPosts, setWeekPosts] = useState<Record<string, PostBreakdown[]>>({});
  const [weekLoading, setWeekLoading] = useState<string | null>(null);

  const wkCol = SETTLEMENT_HISTORY_WEEK_START_COLUMN;
  const bpCol = SETTLEMENT_HISTORY_BONUS_VIBES_COLUMN;

  const loadPostsForWeek = useCallback(
    async (uid: string, weekStart: string): Promise<PostBreakdown[]> => {
      const supabase = getSupabaseBrowserClient();
      const range = getUtcWeekRangeIso(weekStart.trim());
      if (!range) {
        return [];
      }
      const { startIso, endIso } = range;

      const { data: logs, error: logErr } = await supabase
        .from("activity_logs")
        .select(
          `
          id,
          content,
          proof_url,
          qualified_view_count,
          created_at,
          activity_types ( name )
        `
        )
        .eq("user_id", uid)
        .eq("status", "approved")
        .eq("is_settled", true)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: false });

      if (logErr || !logs?.length) {
        return [];
      }

      const ids = logs.map((v) => String((v as { id: string }).id));
      const syncCountByActivityId = new Map<string, number>();
      const { data: syncRows } = await supabase.rpc("get_activity_sync_counts", {
        p_activity_ids: ids,
      });
      for (const row of (syncRows ?? []) as ActivitySyncCountRow[]) {
        syncCountByActivityId.set(
          String(row.activity_id),
          toNonNegativeInteger(row.sync_count)
        );
      }

      const out: PostBreakdown[] = [];
      for (const raw of logs) {
        const log = raw as {
          id: string;
          content: string | null;
          proof_url?: string | null;
          qualified_view_count?: number | null;
          created_at: string;
          activity_types: unknown;
        };
        const at = firstOrNull(
          log.activity_types as { name: string | null } | null
        );
        out.push(
          buildPostBreakdown(
            {
              id: log.id,
              content: log.content,
              proof_url: log.proof_url,
              qualified_view_count: log.qualified_view_count,
              created_at: log.created_at,
              activity_types: at,
            },
            syncCountByActivityId.get(log.id) ?? 0
          )
        );
      }
      return out;
    },
    []
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user?.id) {
        setUserId(null);
        setRows([]);
        setHeroPosts(null);
        setLoading(false);
        return;
      }

      setUserId(user.id);

      if (!wkCol?.trim() || !bpCol?.trim()) {
        setRows([]);
        setHeroPosts([]);
        setLoading(false);
        return;
      }

      const { data, error: qErr } = await supabase
        .from("settlement_history")
        .select(`id, ${wkCol}, ${bpCol}, created_at`)
        .eq("user_id", user.id)
        .order(wkCol, { ascending: false });

      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setRows([]);
        setHeroPosts([]);
      } else {
        const list = (data ?? []) as Record<string, unknown>[];
        const parsedRows = list.map((r) => {
          const rawWeek = r[wkCol];
          const weekStart =
            rawWeek == null ? "" : String(rawWeek).trim();
          const rawCreated = r.created_at;
          const createdAt =
            rawCreated == null ? "" : String(rawCreated);
          return {
            id: String(r.id),
            week_start: weekStart,
            bonus_vibes: Number(r[bpCol] ?? 0),
            created_at: createdAt,
          };
        });
        setRows(parsedRows);
        const latestWeek = parsedRows[0]?.week_start?.trim();
        const posts = latestWeek
          ? await loadPostsForWeek(user.id, latestWeek)
          : [];
        if (!cancelled) {
          setHeroPosts(posts);
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [wkCol, bpCol, loadPostsForWeek]);

  const latestSettlement = useMemo(() => rows[0] ?? null, [rows]);

  const heroParts = useMemo(
    () => sumBreakdownParts(heroPosts ?? []),
    [heroPosts]
  );
  const heroKpis = useMemo(() => {
    const list = heroPosts ?? [];
    let totalSyncs = 0;
    let totalViews = 0;
    for (const p of list) {
      totalSyncs += p.syncCount;
      totalViews += p.viewCount;
    }
    return {
      totalPosts: list.length,
      totalSyncs,
      totalViews,
    };
  }, [heroPosts]);
  const heroContributionRatio = useMemo(() => {
    const total = heroParts.total;
    if (total <= 0) return { syncPct: 0, viewPct: 0 };
    return {
      syncPct: Math.round((heroParts.syncVibes / total) * 100),
      viewPct: Math.max(0, 100 - Math.round((heroParts.syncVibes / total) * 100)),
    };
  }, [heroParts]);

  const renderFormulaLines = (p: PostBreakdown) => (
    <div className="mt-2 space-y-1.5 text-[11px] text-zinc-500">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="shrink-0 text-zinc-600">보너스</span>
        <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="tabular-nums">
            (Sync {p.syncCount.toLocaleString("ko-KR")} × 5V)
          </span>
          <span className="text-zinc-600">+</span>
          <span className="tabular-nums">
            (⌊조회 {p.viewCount.toLocaleString("ko-KR")} ÷ 10⌋)
          </span>
        </span>
      </div>
      <p className="tabular-nums leading-relaxed text-zinc-500">
        = {p.syncVibes.toLocaleString("ko-KR")} + {p.viewVibes.toLocaleString("ko-KR")} ={" "}
        <span className="text-zinc-300">{p.bonusTotal.toLocaleString("ko-KR")}V</span>
      </p>
    </div>
  );

  const renderWeekLine = (item: WeekLineItem, bestId: string | null) => {
    if (item.kind === "deleted") {
      return (
        <li
          key={item.key}
          className="rounded-xl border border-dashed border-zinc-600/50 bg-zinc-950/40 px-3 py-3 sm:px-4"
        >
          <p className="text-sm text-zinc-500">(삭제된 활동입니다)</p>
          <p className="mt-3 text-lg font-semibold tabular-nums text-zinc-400">
            +{item.bonusVibes.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-normal text-zinc-600">V</span>
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
            정산 시점에 확정된 보너스 중, 더 이상 조회할 수 없는 활동에 해당하는 분입니다.
          </p>
        </li>
      );
    }
    const p = item.post;
    return (
      <li
        key={p.id}
        className="rounded-xl border border-white/[0.06] bg-zinc-950/50 px-3 py-3 sm:px-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-emerald-500/90">{p.activityName}</p>
            <p className="mt-1 text-sm text-zinc-200">{p.contentPreview}</p>
          </div>
          {p.thumbnailUrl ? (
            <div className="shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumbnailUrl}
                alt="활동 썸네일"
                className="h-14 w-14 object-cover"
                loading="lazy"
              />
            </div>
          ) : null}
          {bestId === p.id ? (
            <span className="shrink-0 rounded-full border border-amber-300/60 bg-gradient-to-r from-amber-400/25 to-yellow-300/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.45)]">
              Best Contributor
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-lg font-semibold tabular-nums text-white">
          +{p.bonusTotal.toLocaleString("ko-KR")}
          <span className="ml-1 text-sm font-normal text-zinc-500">V</span>
        </p>
        {renderFormulaLines(p)}
      </li>
    );
  };

  const toggleWeek = (row: SettlementHistoryRow) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (!userId) return;
    if (weekPosts[row.id] !== undefined) return;
    setWeekLoading(row.id);
    void (async () => {
      const posts = await loadPostsForWeek(userId, row.week_start);
      setWeekPosts((prev) => ({ ...prev, [row.id]: posts }));
      setWeekLoading(null);
    })();
  };

  return (
    <div className="min-h-screen bg-[#0c0e12] px-4 py-10 text-zinc-100 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/profile"
          className="text-sm text-zinc-500 transition hover:text-emerald-300/90"
        >
          ← 프로필
        </Link>

        <header className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-500/80">
            Weekly reward report
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            주간 리워드 리포트
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            주차별 확정 가중 보너스와 게시글 단위 산출 내역을 확인하세요.
          </p>
        </header>

        {!loading && !userId ? (
          <p className="mt-10 text-sm text-zinc-400">
            로그인 후 정산 리포트를 볼 수 있어요.{" "}
            <Link href="/login?next=/settlements" className="text-emerald-400 underline">
              로그인
            </Link>
          </p>
        ) : null}

        {loading ? (
          <p className="mt-10 text-sm text-zinc-500">불러오는 중…</p>
        ) : error ? (
          <p className="mt-10 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </p>
        ) : userId ? (
          <>
            {/* 이번 주 요약 */}
            <section className="mt-10 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/80 via-[#0f1419] to-zinc-950 shadow-[0_0_0_1px_rgba(16,185,129,0.06)]">
              <div className="border-b border-white/5 px-5 py-4 sm:px-6">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-400/90">
                  최근 완료 정산 주차{" "}
                  {latestSettlement
                    ? `(UTC 기준 주 시작 ${formatCalendarDateForDisplay(latestSettlement.week_start)})`
                    : ""}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  유저가 가장 최근에 받은 확정 보상을 먼저 보여줍니다.
                </p>
              </div>
              <div className="px-5 py-6 sm:px-6">
                {heroPosts === null ? (
                  <p className="text-sm text-zinc-500">집계 중…</p>
                ) : (
                  <>
                    <p className="text-xs text-zinc-500">최근 정산 확정 총 보너스 VIBE</p>
                    <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-white">
                      +
                      {(latestSettlement?.bonus_vibes ?? 0).toLocaleString("ko-KR")}
                      <span className="ml-1.5 text-lg font-medium text-zinc-400">V</span>
                    </p>
                    {!latestSettlement ? (
                      <p className="mt-3 text-xs text-amber-200/80">
                        아직 확정된 정산 레코드가 없습니다. (정산 배치 후 반영됩니다.)
                      </p>
                    ) : null}

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-xs font-medium text-zinc-500">총 게시글 수</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-white">
                          {heroKpis.totalPosts.toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-xs font-medium text-zinc-500">총 Sync 수</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-200">
                          {heroKpis.totalSyncs.toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-xs font-medium text-zinc-500">총 조회수</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-sky-200">
                          {heroKpis.totalViews.toLocaleString("ko-KR")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-xs font-medium text-zinc-500">Sync 기여</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-200">
                          +{heroParts.syncVibes.toLocaleString("ko-KR")}
                          <span className="ml-1 text-sm font-normal text-zinc-500">V</span>
                        </p>
                        <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                          Σ (Sync 수 × 5), 이번 주 게시글 합
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-xs font-medium text-zinc-500">조회 기여</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-sky-200">
                          +{heroParts.viewVibes.toLocaleString("ko-KR")}
                          <span className="ml-1 text-sm font-normal text-zinc-500">V</span>
                        </p>
                        <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                          Σ ⌊조회 ÷ 10⌋, 이번 주 게시글 합
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <p className="text-xs font-medium text-zinc-500">
                        기여 비율 (Sync vs 조회)
                      </p>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                          style={{ width: `${heroContributionRatio.syncPct}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-500">
                        Sync {heroContributionRatio.syncPct}% · 조회 {heroContributionRatio.viewPct}%
                      </p>
                    </div>

                    {heroPosts !== null &&
                    latestSettlement &&
                    heroParts.total !== latestSettlement.bonus_vibes ? (
                      <p className="mt-4 text-[11px] text-amber-200/70">
                        참고: 역산 합({heroParts.total}V)과 확정액이 다를 수 있습니다. (다른 주차
                        데이터 혼입·반올림 등)
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </section>

            {/* 상세: 주차별 */}
            <section className="mt-12">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                정산 상세 내역
              </h2>
              <p className="mt-1 text-xs text-zinc-600">
                카드를 눌러 해당 주에 정산에 포함된 게시글을 확인합니다.
              </p>

              {rows.length === 0 ? (
                <p className="mt-8 text-sm text-zinc-500">아직 정산 이력이 없습니다.</p>
              ) : (
                <ul className="mt-6 space-y-3">
                  {rows.map((row) => {
                    const open = expandedId === row.id;
                    const posts = weekPosts[row.id];
                    const loadingThis = weekLoading === row.id;
                    const bestId =
                      posts !== undefined ? pickBestContributorId(posts) : null;
                    const lineItems =
                      posts !== undefined
                        ? mergeDeletedGap(row.bonus_vibes, posts, row.id)
                        : [];
                    const sumPosted =
                      posts?.reduce(
                        (s, p) => s + Math.max(0, Math.floor(p.bonusTotal)),
                        0
                      ) ?? 0;
                    const rowBonusSafe = Math.max(
                      0,
                      Math.floor(Number(row.bonus_vibes) || 0)
                    );
                    const dataDrift = posts !== undefined && sumPosted > rowBonusSafe;

                    return (
                      <li
                        key={row.id}
                        className="overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/40 shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => toggleWeek(row)}
                          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/[0.03] sm:px-5"
                          aria-expanded={open}
                        >
                          <div>
                            <p className="text-sm font-medium text-white">
                              주간 · {formatCalendarDateForDisplay(row.week_start)}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              기록일 {formatTimestampForDisplay(row.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-semibold tabular-nums text-emerald-300/95">
                              +{row.bonus_vibes.toLocaleString("ko-KR")} V
                            </span>
                            <ChevronDown
                              className={`h-5 w-5 shrink-0 text-zinc-500 transition ${
                                open ? "rotate-180" : ""
                              }`}
                              aria-hidden
                            />
                          </div>
                        </button>

                        {open ? (
                          <div className="border-t border-white/[0.06] bg-black/20 px-4 py-4 sm:px-5">
                            {loadingThis || posts === undefined ? (
                              <p className="text-sm text-zinc-500">게시글 불러오는 중…</p>
                            ) : lineItems.length === 0 ? (
                              <p className="text-sm text-zinc-500">
                                이 주차에 표시할 정산 내역이 없습니다.
                              </p>
                            ) : (
                              <>
                                {dataDrift ? (
                                  <p className="mb-3 text-[11px] text-amber-200/80">
                                    참고: 현재 게시글 합({sumPosted.toLocaleString("ko-KR")}V)이
                                    확정액({rowBonusSafe.toLocaleString("ko-KR")}V)보다 큽니다. 데이터
                                    불일치일 수 있어요.
                                  </p>
                                ) : null}
                                <div className="max-h-[min(70vh,28rem)] overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                                  <ul className="space-y-4 pb-1">
                                    {lineItems.map((item) =>
                                      renderWeekLine(item, bestId)
                                    )}
                                  </ul>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
