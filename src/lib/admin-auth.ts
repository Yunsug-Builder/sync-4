import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-service";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function isAdminByAccessToken(accessToken: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(accessToken);
  console.log("[admin-auth] current access user id", user?.id ?? null);
  if (!user?.id) return false;
  const adminClient = createSupabaseServiceRoleClient();
  const { data } = await adminClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  console.log("[admin-auth] profiles.is_admin", data?.is_admin ?? null);
  return Boolean(data?.is_admin);
}

export async function resolveServerAdminAccess(): Promise<"allow" | "deny"> {
  const store = await cookies();
  console.log("전체 쿠키 목록:", store.getAll().map((c) => c.name));
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.log("[admin-auth] current access user id", user?.id ?? null);
  if (!user?.id) {
    console.log("[admin-auth] access token not found in cookies", {
      cookieNames: store.getAll().map((c) => c.name),
    });
    return "deny";
  }
  const adminClient = createSupabaseServiceRoleClient();
  const { data } = await adminClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  console.log("[admin-auth] profiles.is_admin", data?.is_admin ?? null);
  return data?.is_admin ? "allow" : "deny";
}

export function getAccessTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

