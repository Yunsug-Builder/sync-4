import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient as getSsrBrowserClient } from "@/utils/supabase/client";

function getEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local (see project root).`
    );
  }
  return value;
}

/**
 * anon 키로 Supabase 클라이언트 생성 (RLS 적용).
 * Route Handler·Server Action 등 서버 코드에서도 사용합니다.
 */
export function createSupabaseAnonClient(): SupabaseClient {
  return createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

/** 브라우저·클라이언트 컴포넌트용 Supabase SSR browser client. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    return createSupabaseAnonClient();
  }
  return getSsrBrowserClient();
}
