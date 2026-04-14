"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type FeedRowRaw = {
  id: string;
  content: string;
  proof_url: string | null;
  created_at: string;
  artist_id: string;
  is_settled?: boolean | null;
  profiles: unknown;
  activity_types: unknown;
};

type FeedEntry = {
  id: string;
  content: string;
  proof_url: string | null;
  created_at: string;
  nickname: string;
  activityName: string;
  isSettled: boolean;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function normalizeFeedRow(row: FeedRowRaw): FeedEntry {
  const prof = firstOrNull(row.profiles as { nickname: string | null } | null);
  const at = firstOrNull(row.activity_types as { name: string } | null);
  return {
    id: row.id,
    content: row.content,
    proof_url: row.proof_url,
    created_at: row.created_at,
    nickname: prof?.nickname?.trim() || "익명",
    activityName: at?.name?.trim() || "활동",
    isSettled: Boolean(row.is_settled),
  };
}

export default function HomeClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<{ nickname: string | null; total_vibes: number } | null>(
    null
  );
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setMe(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    void supabase
      .from("profiles")
      .select("nickname, total_vibes")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setMe(null);
          return;
        }
        if (!data) {
          setMe(null);
          return;
        }
        setMe({
          nickname: data.nickname,
          total_vibes: typeof data.total_vibes === "number" ? data.total_vibes : 0,
        });
      });
  }, [session?.user?.id]);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setLoadError(null);

    const supabase = getSupabaseBrowserClient();

    const btsRes = await supabase.from("artists").select("id").eq("name", "BTS").limit(1).maybeSingle();

    if (btsRes.error) {
      setLoadError(btsRes.error.message);
      setEntries([]);
      setLoadingFeed(false);
      return;
    }

    const btsId = btsRes.data?.id as string | undefined;
    if (!btsId) {
      setLoadError("BTS 아티스트 정보를 찾을 수 없습니다.");
      setEntries([]);
      setLoadingFeed(false);
      return;
    }

    const { data, error } = await supabase
      .from("activity_logs")
      .select(
        `
        id,
        content,
        proof_url,
        created_at,
        artist_id,
        is_settled,
        profiles ( nickname ),
        activity_types ( name )
      `
      )
      .eq("status", "approved")
      .eq("artist_id", btsId)
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setEntries([]);
      setLoadingFeed(false);
      return;
    }

    const rows = (data ?? []) as FeedRowRaw[];
    setEntries(rows.map(normalizeFeedRow));
    setLoadingFeed(false);
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const loggedIn = Boolean(session?.user);
  const submitHref = loggedIn ? "/activities/submit" : "/login";
  const meLabel =
    me?.nickname?.trim() ||
    (session?.user?.email ? session.user.email.split("@")[0] : null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-fuchsia-300/90">
              SYNC
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              SYNC: BTS 글로벌 아카이브
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              팬들이 인증한 활동을 한곳에서 모아 보여 드려요.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
            {loggedIn ? (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-2 text-right text-xs text-zinc-400">
                <p className="font-medium text-zinc-200">{meLabel ?? "회원"}</p>
                <p className="mt-0.5 tabular-nums text-zinc-500">
                  VIBE{" "}
                  <span className="font-semibold text-fuchsia-200/90">
                    {(me?.total_vibes ?? 0).toLocaleString("ko-KR")}
                  </span>
                  V
                </p>
              </div>
            ) : (
              <p className="max-w-[14rem] text-right text-xs text-zinc-500">
                로그인하면 활동 인증을 제출할 수 있어요.
              </p>
            )}
            <Link
              href={submitHref}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-white px-5 text-sm font-medium text-zinc-950 transition hover:opacity-90 sm:w-auto"
            >
              활동 인증하기
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {loadError ? (
          <div
            className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100"
            role="alert"
          >
            {loadError}
          </div>
        ) : loadingFeed ? (
          <p className="text-sm text-zinc-500">아카이브를 불러오는 중…</p>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-zinc-900/35 px-8 py-16 text-center">
            <p className="text-lg font-medium text-zinc-200">아직 공개된 인증이 없습니다</p>
            <p className="mt-2 text-sm text-zinc-500">
              첫 인증이 승인되면 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-5">
            {entries.map((entry) => {
              const detailHref = `/activities/${encodeURIComponent(entry.id)}`;
              const proofTrimmed = entry.proof_url?.trim() ?? "";
              const hasProof = proofTrimmed.length > 0;

              return (
                <li key={entry.id} className="relative">
                  <Link
                    href={detailHref}
                    className="absolute inset-0 z-0 rounded-2xl outline-offset-2 ring-offset-zinc-950 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-fuchsia-400/50"
                  >
                    <span className="sr-only">{entry.activityName} 인증 상세 보기</span>
                  </Link>
                  <article className="pointer-events-none relative z-[1] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/55 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
                    <div className="border-b border-white/5 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="font-semibold text-white">{entry.nickname}</p>
                          <span className="rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-0.5 text-xs font-medium text-fuchsia-100">
                            {entry.activityName}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                            entry.isSettled
                              ? "border-zinc-500/40 bg-zinc-800/80 text-zinc-400"
                              : "border-amber-400/35 bg-amber-500/10 text-amber-100"
                          }`}
                        >
                          {entry.isSettled ? "정산 완료" : "정산 예정"}
                        </span>
                      </div>
                    </div>
                    <div className="px-5 py-5">
                      <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                        {entry.content}
                      </p>
                    </div>
                    {hasProof ? (
                      <div className="pointer-events-auto border-t border-white/5 px-5 py-4">
                        <a
                          href={proofTrimmed}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative z-[2] inline-flex h-10 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-medium text-zinc-200 transition hover:border-fuchsia-400/40 hover:text-white"
                        >
                          원문 보러가기
                        </a>
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
