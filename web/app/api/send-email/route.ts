import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/admin-auth";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    if (!resend) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "LocalBiz Pro update";
    const message = typeof body?.message === "string" ? body.message : "";

    if (!to || !message) {
      return NextResponse.json(
        { error: "Recipient and message are required." },
        { status: 400 }
      );
    }

    const data = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "DigitalPulse Store <onboarding@resend.dev>",
      to,
      subject,
      html: `<p style="font-family: Arial, sans-serif; line-height: 1.6;">${message
        .replace(/\n/g, "<br />")}</p>`,
    });

    const emailId = data && typeof data === "object" && "id" in data ? data.id : null;

    return NextResponse.json({ ok: true, id: emailId });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Unable to send email." }, { status: 500 });
  }
}
