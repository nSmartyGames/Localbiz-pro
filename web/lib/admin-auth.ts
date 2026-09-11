import { currentUser } from "@clerk/nextjs/server";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "lucian.virtic@gmail.com").toLowerCase();

export async function requireAdmin() {
  const user = await currentUser();
  const isAdmin = user?.emailAddresses.some(
    (emailAddress) => emailAddress.emailAddress.toLowerCase() === ADMIN_EMAIL
  );

  if (!isAdmin) {
    return null;
  }

  return user;
}
