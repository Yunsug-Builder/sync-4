"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { LanguageCode } from "@/components/home/FeedCard";

const PREFERRED_LANGUAGE_STORAGE_KEY = "fandom-preferred-language";

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

function readStoredLanguage(): LanguageCode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFERRED_LANGUAGE_STORAGE_KEY);
    if (raw == null || raw === "") return null;
    const code = raw.trim().toUpperCase();
    if (code === "KO" || code === "EN" || code === "ZH" || code === "JA") {
      return code;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredLanguage(code: LanguageCode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, code);
  } catch (e) {
    console.warn("[LanguageProvider] localStorage.setItem failed:", e);
  }
}

function getBrowserDefaultLanguage(): LanguageCode {
  if (typeof window === "undefined") return "EN";
  const raw = window.navigator.language?.toLowerCase() ?? "";
  if (raw.startsWith("ko")) return "KO";
  if (raw.startsWith("ja")) return "JA";
  if (raw.startsWith("zh")) return "ZH";
  return "EN";
}

function logSupabaseError(context: string, error: { message?: string; code?: string; details?: string; hint?: string }) {
  console.error(`[LanguageProvider] ${context}`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [language, setLanguageState] = useState<LanguageCode>("EN");
  const [ready, setReady] = useState(false);
  /** Bumps when user changes language so in-flight profile loads cannot overwrite the pick. */
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const load = async () => {
      const seq = ++loadGenerationRef.current;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (seq !== loadGenerationRef.current) return;
          const guestLang = readStoredLanguage() ?? getBrowserDefaultLanguage();
          setLanguageState(guestLang);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("preferred_language")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          logSupabaseError("profiles select (preferred_language) failed:", error);
          if (seq !== loadGenerationRef.current) return;
          const fallback = readStoredLanguage() ?? getBrowserDefaultLanguage();
          setLanguageState(fallback);
          return;
        }

        if (!data) {
          if (seq !== loadGenerationRef.current) return;
          const fallback = readStoredLanguage() ?? getBrowserDefaultLanguage();
          setLanguageState(fallback);
          return;
        }

        const rawPref = (data as { preferred_language?: unknown }).preferred_language;
        const preferred =
          rawPref != null && String(rawPref).trim() !== ""
            ? normalizeLanguage(rawPref)
            : (readStoredLanguage() ?? getBrowserDefaultLanguage());

        if (seq !== loadGenerationRef.current) return;
        setLanguageState(preferred);
        writeStoredLanguage(preferred);
      } finally {
        if (seq === loadGenerationRef.current) {
          setReady(true);
        }
      }
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

  const setLanguage = useCallback(
    async (next: LanguageCode) => {
      const normalized = normalizeLanguage(next);
      let previous: LanguageCode = "EN";
      loadGenerationRef.current += 1;
      setLanguageState((p) => {
        previous = p;
        return normalized;
      });

      const applyGuestLanguage = () => {
        writeStoredLanguage(normalized);
        startTransition(() => {
          router.refresh();
        });
        setReady(true);
      };

      try {
        const supabase = getSupabaseBrowserClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) {
          console.warn("[LanguageProvider] auth.getUser() failed; skipping DB (guest-style path).", {
            message: authError.message,
            status: (authError as { status?: number }).status,
          });
          applyGuestLanguage();
          return;
        }

        const userId = authData?.user?.id;
        const isLoggedIn = typeof userId === "string" && userId.length > 0;

        if (!isLoggedIn) {
          applyGuestLanguage();
          return;
        }

        const { data: updated, error } = await supabase
          .from("profiles")
          .update({ preferred_language: normalized })
          .eq("id", userId)
          .select("preferred_language")
          .maybeSingle();

        if (error) {
          logSupabaseError("profiles update (preferred_language) failed:", error);
          setLanguageState(previous);
          setReady(true);
          return;
        }

        if (!updated) {
          console.error("[LanguageProvider] profiles update succeeded but no row returned (check RLS or matching id).", {
            userId,
          });
          setLanguageState(previous);
          setReady(true);
          return;
        }

        const saved = normalizeLanguage((updated as { preferred_language?: unknown }).preferred_language);
        if (saved !== normalized) {
          console.error("[LanguageProvider] profiles preferred_language mismatch after update.", {
            expected: normalized,
            got: saved,
            row: updated,
          });
          setLanguageState(previous);
          setReady(true);
          return;
        }

        writeStoredLanguage(normalized);
        startTransition(() => {
          router.refresh();
        });
        setReady(true);
        if (typeof window !== "undefined") {
          queueMicrotask(() => {
            window.location.reload();
          });
        }
      } catch (unexpected) {
        console.error("[LanguageProvider] setLanguage unexpected error:", unexpected);
        let loggedIn = false;
        try {
          const supabase = getSupabaseBrowserClient();
          const { data: authData, error: authErr } = await supabase.auth.getUser();
          loggedIn =
            !authErr &&
            typeof authData?.user?.id === "string" &&
            authData.user.id.length > 0;
        } catch {
          loggedIn = false;
        }
        if (!loggedIn) {
          applyGuestLanguage();
          return;
        }
        setLanguageState(previous);
        setReady(true);
      }
    },
    [router, startTransition]
  );

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
