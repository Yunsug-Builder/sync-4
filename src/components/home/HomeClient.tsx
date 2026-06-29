"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { FeedCard } from "@/components/home/FeedCard";
import { useLanguage } from "@/components/providers/LanguageProvider";

type FeedRowRaw = {
  id: string;
  user_id: string;
  content: string;
  translations?: Record<string, string> | null;
  proof_url: string | null;
  image_urls?: string[] | null;
  created_at: string;
  artist_id: string;
  total_reward_vibes?: number | null;
  is_settled?: boolean | null;
  profiles: unknown;
  activity_types: unknown;
};

type FeedEntry = {
  id: string;
  user_id: string;
  content: string;
  translations: Record<string, string> | null;
  proof_url: string | null;
  image_urls: string[];
  created_at: string;
  activityName: string;
  reward_vibes: number;
  sync_count: number;
};

type Artist = {
  id: string;
  name: string;
  image_url: string | null;
  created_at: string;
  fandom_name: string | null;
  description: string | null;
  archive_guide: string | null;
  sync_strategy: string | null;
};

type ActivitySyncCountRow = {
  activity_id: string;
  sync_count: number | string | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toNonNegativeInteger(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeFeedRow(
  row: FeedRowRaw,
  syncCountByActivityId: Map<string, number>
): FeedEntry {
  const at = firstOrNull(row.activity_types as { name: string } | null);
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls
        .map((url) => (typeof url === "string" ? url.trim() : ""))
        .filter((url) => url.length > 0)
    : [];
  return {
    id: row.id,
    user_id: row.user_id,
    content: row.content,
    translations: row.translations ?? null,
    proof_url: row.proof_url,
    image_urls: imageUrls,
    created_at: row.created_at,
    activityName: at?.name?.trim() || "활동",
    reward_vibes: Math.max(0, Number(row.total_reward_vibes ?? 0)),
    sync_count: syncCountByActivityId.get(row.id) ?? 0,
  };
}

export default function HomeClient() {
  const { language: preferredLanguage } = useLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<{ nickname: string | null; total_vibes: number } | null>(
    null
  );
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase
      .from("artists")
      .select(
        "id, name, image_url, created_at, fandom_name, description, archive_guide, sync_strategy"
      )
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setLoadError(error.message);
          setArtists([]);
          return;
        }
        setArtists(((data ?? []) as Artist[]).filter((a) => a.id && a.name));
      });
  }, []);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setLoadError(null);

    const supabase = getSupabaseBrowserClient();

    let query = supabase
      .from("activity_logs")
      .select(
        `
        id,
        user_id,
        content,
        translations,
        proof_url,
        image_urls,
        created_at,
        artist_id,
        total_reward_vibes,
        profiles ( nickname ),
        activity_types ( name )
      `
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (selectedArtistId) {
      query = query.eq("artist_id", selectedArtistId);
    }

    const { data, error } = await query;

    if (error) {
      setLoadError(error.message);
      setEntries([]);
      setLoadingFeed(false);
      return;
    }

    const rows = (data ?? []) as FeedRowRaw[];
    const ids = rows.map((row) => row.id).filter(Boolean);
    const syncCountByActivityId = new Map<string, number>();

    if (ids.length > 0) {
      const { data: syncCounts } = await supabase.rpc("get_activity_sync_counts", {
        p_activity_ids: ids,
      });
      for (const raw of (syncCounts ?? []) as ActivitySyncCountRow[]) {
        syncCountByActivityId.set(
          String(raw.activity_id),
          toNonNegativeInteger(raw.sync_count)
        );
      }
    }

    setEntries(rows.map((row) => normalizeFeedRow(row, syncCountByActivityId)));
    setLoadingFeed(false);
  }, [selectedArtistId]);

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      if (!session?.access_token) {
        toast.error("로그인이 필요합니다.");
        return;
      }
      const confirmed = window.confirm("이 활동을 삭제 처리하시겠습니까?");
      if (!confirmed) return;

      setDeletingEntryId(entryId);
      try {
        const response = await fetch("/api/activity-logs", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ id: entryId }),
        });
        const body = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !body.ok) {
          toast.error(body.error ?? "삭제 처리에 실패했습니다.");
          return;
        }
        toast.success("활동이 삭제 처리되었습니다.");
        setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "삭제 처리 중 오류가 발생했습니다.");
      } finally {
        setDeletingEntryId(null);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  /** Prefer entries that have a non-empty translation for the selected UI language (then newest first). */
  const displayedEntries = useMemo(() => {
    if (preferredLanguage === "KO") {
      return entries;
    }
    const key = preferredLanguage.toLowerCase();
    const hasTranslation = (e: FeedEntry) => {
      const t = e.translations?.[key];
      return typeof t === "string" && t.trim().length > 0;
    };
    return [...entries].sort((a, b) => {
      const diff = Number(hasTranslation(b)) - Number(hasTranslation(a));
      if (diff !== 0) return diff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [entries, preferredLanguage]);

  const loggedIn = Boolean(session?.user);
  const submitHref = loggedIn ? "/write" : "/login";
  const writeHref = loggedIn ? "/write" : "/login";
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
        <nav className="mb-6 overflow-x-auto pb-1" aria-label="아티스트 필터">
          <div className="flex min-w-max items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedArtistId(null)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                selectedArtistId === null
                  ? "border-fuchsia-600/50 bg-fuchsia-600/20 text-fuchsia-100"
                  : "border-white/15 bg-zinc-900/60 text-zinc-300 hover:border-white/25"
              }`}
            >
              전체
            </button>
            {artists.map((artist) => {
              const active = selectedArtistId === artist.id;
              return (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => setSelectedArtistId(artist.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? "border-fuchsia-600/50 bg-fuchsia-600/20 text-fuchsia-100"
                      : "border-white/15 bg-zinc-900/60 text-zinc-300 hover:border-white/25"
                  }`}
                >
                  {artist.name}
                </button>
              );
            })}
          </div>
        </nav>

        {loadError ? (
          <div
            className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100"
            role="alert"
          >
            {loadError}
          </div>
        ) : loadingFeed ? (
          <p className="text-sm text-zinc-500">아카이브를 불러오는 중…</p>
        ) : displayedEntries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-zinc-900/35 px-8 py-16 text-center">
            <p className="text-lg font-medium text-zinc-200">아직 공개된 인증이 없습니다</p>
            <p className="mt-2 text-sm text-zinc-500">
              첫 인증이 승인되면 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-5">
            {displayedEntries.map((entry) => (
              <FeedCard
                key={entry.id}
                entry={entry}
                preferredLanguage={preferredLanguage}
                isMine={session?.user?.id != null && entry.user_id === session.user.id}
                onDelete={handleDeleteEntry}
                deleting={deletingEntryId === entry.id}
              />
            ))}
          </ul>
        )}
      </main>
      <Link
        href={writeHref}
        className="fixed bottom-6 right-6 z-40 inline-flex h-12 items-center justify-center rounded-full bg-fuchsia-500 px-5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-900/40 transition hover:bg-fuchsia-400"
      >
        글쓰기
      </Link>
    </div>
  );
}
