import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import DashboardClient from "../DashboardClient";

export default async function DashboardEmailPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/store/sign-in?redirect_url=/dpstore/dashboard/email");
  }

  // Signed in but not admin: send to store, not sign-in (avoids redirect loop).
  const user = await requireAdmin();
  if (!user) {
    redirect("/store");
  }

  return <DashboardClient initialSection="mail" />;
}
