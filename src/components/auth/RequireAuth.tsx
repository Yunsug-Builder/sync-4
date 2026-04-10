"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "authed" | "anon">("loading");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        setState("anon");
        return;
      }
      setState("authed");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        setState("anon");
        return;
      }
      setState("authed");
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (state !== "authed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        {state === "loading" ? "불러오는 중…" : "로그인 페이지로 이동합니다…"}
      </div>
    );
  }

  return <>{children}</>;
}
