import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

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

/**
 * 브라우저·클라이언트 컴포넌트용 싱글턴(anon key).
 * 서버에서 호출하면 매번 새 클라이언트를 만들지 않도록, 서버에서는 `createSupabaseAnonClient()` 사용을 권장합니다.
 *
 * 세션은 기본적으로 localStorage에 저장되며(refresh token으로 갱신), 브라우저를 닫아도 유지됩니다.
 * 최대 유지 기간(예: 30일)은 Supabase 대시보드 Authentication 설정에서 조정합니다.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    return createSupabaseAnonClient();
  }
  if (!browserClient) {
    browserClient = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
  return browserClient;
}
