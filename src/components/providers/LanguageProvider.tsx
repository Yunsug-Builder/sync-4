"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { LanguageCode } from "@/components/home/FeedCard";

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (next: LanguageCode) => Promise<void>;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function normalizeLanguage(value: unknown): LanguageCode {
  const code = typeof value === "string" ? value.toUpperCase() : "";
  if (code === "KO" || code === "EN" || code === "ZH" || code === "JA") {
    return code;
  }
  return "EN";
}

function getBrowserDefaultLanguage(): LanguageCode {
  if (typeof window === "undefined") return "EN";
  const raw = window.navigator.language?.toLowerCase() ?? "";
  if (raw.startsWith("ko")) return "KO";
  if (raw.startsWith("ja")) return "JA";
  if (raw.startsWith("zh")) return "ZH";
  return "EN";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("EN");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLanguageState(getBrowserDefaultLanguage());
        setReady(true);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !data) {
        setLanguageState(getBrowserDefaultLanguage());
        setReady(true);
        return;
      }

      const preferred = normalizeLanguage((data as { preferred_language?: unknown }).preferred_language);
      setLanguageState(preferred);
      setReady(true);
    };

    void load();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      setReady(false);
      void load();
    });

    return () => {
      authSub.subscription.unsubscribe();
    };
  }, []);

  const setLanguage = useCallback(async (next: LanguageCode) => {
    const normalized = normalizeLanguage(next);
    setLanguageState(normalized);

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase
      .from("profiles")
      .update({ preferred_language: normalized })
      .eq("id", user.id);
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      ready,
    }),
    [language, ready, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

