import { createSupabaseServiceRoleClient } from "@/lib/supabase-service";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function isAdminByAccessToken(accessToken: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(accessToken);
  if (!user?.id) return false;
  const adminClient = createSupabaseServiceRoleClient();
  const { data } = await adminClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(data?.is_admin);
}

export async function resolveServerAdminAccess(): Promise<"allow" | "deny"> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return "deny";
  }
  const adminClient = createSupabaseServiceRoleClient();
  const { data } = await adminClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  return data?.is_admin ? "allow" : "deny";
}

export function getAccessTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

