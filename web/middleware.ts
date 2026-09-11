import { clerkMiddleware } from "@clerk/nextjs/server";

// No route protection is enforced here. All /store/* pages remain publicly
// browsable (including /store/cart). Clerk's middleware still needs to run
// on every request so that auth()/session context is available wherever
// it's used — most importantly inside app/api/checkout/route.ts, which is
// responsible for enforcing sign-in before completing a purchase.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
