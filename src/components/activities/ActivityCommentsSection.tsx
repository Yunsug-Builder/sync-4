"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Props = {
  activityLogId: string;
  isApproved: boolean;
};

type CommentItem = {
  id: string;
  content: string;
  created_at: string;
  nickname: string;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ActivityCommentsSection({ activityLogId, isApproved }: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loginHref = `/login?next=${encodeURIComponent(`/activities/${activityLogId}`)}`;

  const load = useCallback(async () => {
    if (!isApproved) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("activity_comments")
      .select(
        `
        id,
        content,
        created_at,
        profiles ( nickname )
      `
      )
      .eq("activity_log_id", activityLogId)
      .order("created_at", { ascending: true });

    if (error) {
      setComments([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as {
      id: string;
      content: string;
      created_at: string;
      profiles: unknown;
    }[];

    setComments(
      rows.map((r) => {
        const prof = firstOrNull(r.profiles as { nickname: string | null } | null);
        return {
          id: r.id,
          content: r.content,
          created_at: r.created_at,
          nickname: prof?.nickname?.trim() || "익명",
        };
      })
    );
    setLoading(false);
  }, [activityLogId, isApproved]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setHasSession(Boolean(data.user?.id));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(Boolean(session?.user?.id));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const text = draft.trim();
    if (!text) {
      setFormError("댓글 내용을 입력해 주세요.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      window.location.href = loginHref;
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("activity_comments").insert({
      activity_log_id: activityLogId,
      user_id: user.id,
      content: text,
    });
    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setDraft("");
    void load();
  };

  if (!isApproved) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">댓글</h2>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">불러오는 중…</p>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">아직 댓글이 없습니다.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-2xl border border-white/10 bg-zinc-900/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-zinc-200">{c.nickname}</span>
                <time className="text-xs text-zinc-500" dateTime={c.created_at}>
                  {formatTime(c.created_at)}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {c.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
        {!hasSession ? (
          <p className="text-xs text-zinc-500">
            댓글을 남기려면{" "}
            <Link href={loginHref} className="text-fuchsia-300 underline underline-offset-2">
              로그인
            </Link>
            이 필요합니다.
          </p>
        ) : null}
        <label className="block">
          <span className="sr-only">댓글 입력</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="댓글을 입력해 주세요."
            disabled={!hasSession || submitting}
            className="w-full resize-none rounded-2xl border border-white/15 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-fuchsia-400/45 disabled:opacity-50"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!hasSession || submitting}
            className="h-10 rounded-2xl bg-white px-5 text-sm font-medium text-zinc-950 transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "등록 중…" : "댓글 등록"}
          </button>
        </div>
        {formError ? (
          <p className="text-sm text-red-300" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </section>
  );
}
