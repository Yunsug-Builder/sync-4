"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function decodeOAuthDescription(raw: string | null) {
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const doneRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );

    const oauthError = params.get("error") ?? hashParams.get("error");
    const oauthErrorDescription =
      params.get("error_description") ?? hashParams.get("error_description");

    if (oauthError) {
      const msg =
        decodeOAuthDescription(oauthErrorDescription) ?? oauthError;
      router.replace(`/login?error=${encodeURIComponent(msg)}`);
      return;
    }

    const supabase = getSupabaseBrowserClient();

    const redirectSuccess = () => {
      if (doneRef.current) {
        return;
      }
      doneRef.current = true;
      router.replace("/?auth=success");
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        redirectSuccess();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        redirectSuccess();
      }
    });

    const retryDelaysMs = [0, 120, 350, 700, 1400];
    const retryTimers = retryDelaysMs.map((ms) =>
      window.setTimeout(() => {
        void supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            redirectSuccess();
          }
        });
      }, ms)
    );

    const failTimer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (!data.session && !doneRef.current) {
          router.replace(
            `/login?error=${encodeURIComponent(
              "로그인 링크가 만료되었거나 이미 사용되었습니다. 새로 매직링크를 요청해 주세요."
            )}`
          );
        }
      });
    }, 15000);

    return () => {
      listener.subscription.unsubscribe();
      retryTimers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(failTimer);
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="text-sm text-zinc-400">로그인 처리 중…</p>
    </main>
  );
}
