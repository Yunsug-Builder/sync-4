"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapOtpError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("invalid email") || lower.includes("invalid login credentials")) {
    return "이메일 주소 형식이 올바르지 않거나 등록할 수 없습니다.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (lower.includes("signups not allowed") || lower.includes("signup")) {
    return "현재 새 계정 가입이 제한되어 있습니다. 관리자에게 문의해 주세요.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
  }

  return message;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("error");
    if (!q) {
      return;
    }
    try {
      setError(decodeURIComponent(q.replace(/\+/g, " ")));
    } catch {
      setError(q);
    }
  }, [searchParams]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        router.replace("/");
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const handleMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("이메일 주소를 입력해 주세요.");
      setLoading(false);
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("올바른 이메일 형식이 아닙니다. 예: name@example.com");
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        setError(mapOtpError(otpError.message));
        return;
      }

      setMessage("매직 링크를 이메일로 보냈습니다. 메일함을 확인해 주세요.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
      setError(mapOtpError(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
        <p className="text-xs tracking-[0.2em] text-zinc-500">SYNC</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">매직링크로 로그인</h1>
        <p className="mt-3 text-sm text-zinc-400">이메일만 입력하면 로그인 링크를 보내 드립니다.</p>

        <form onSubmit={handleMagicLink} className="mt-10 space-y-4">
          <label className="block">
            <span className="sr-only">이메일</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="name@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-2xl border border-white/15 bg-zinc-950 px-4 text-sm outline-none transition placeholder:text-zinc-500 focus:border-white/35"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="h-12 w-full rounded-2xl bg-white text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "전송 중…" : "매직링크 받기"}
          </button>
        </form>

        {message ? (
          <p className="mt-5 text-sm leading-relaxed text-emerald-300">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm leading-relaxed text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black text-white">
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
