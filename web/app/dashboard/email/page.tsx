import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import DashboardClient from "../DashboardClient";

export default async function DashboardEmailPage() {
  const user = await requireAdmin();

  if (!user) {
    redirect("/store/sign-in?redirect_url=/dashboard/email");
  }

  return <DashboardClient initialSection="mail" />;
}
