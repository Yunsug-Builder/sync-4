import { redirect } from "next/navigation";
import AdminActivityReviewClient from "@/app/admin/activities/[id]/AdminActivityReviewClient";
import { resolveServerAdminAccess } from "@/lib/admin-auth";

export default async function AdminActivityDetailPage() {
  const access = await resolveServerAdminAccess();
  if (access === "deny") redirect("/");
  return <AdminActivityReviewClient />;
}
