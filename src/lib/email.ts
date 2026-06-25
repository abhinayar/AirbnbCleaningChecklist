import { Resend } from "resend";
import { prisma } from "./db";

// Lazy so importing this module during build (no env yet) doesn't fail.
let _resend: Resend | null = null;
function resendClient(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Resolve report recipients: the admin-editable Settings row wins, falling back
 * to the REPORT_RECIPIENTS env var.
 */
export async function getRecipients(): Promise<string[]> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const raw = settings?.recipients?.trim() || process.env.REPORT_RECIPIENTS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getFromAddress(): Promise<string> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return (
    settings?.fromEmail?.trim() ||
    process.env.RESEND_FROM ||
    "Cleaning QC <onboarding@resend.dev>"
  );
}

export async function sendReportEmail(opts: {
  subject: string;
  pdf: Buffer;
  filename: string;
  intro: string;
}): Promise<{ sentTo: string[] }> {
  const to = await getRecipients();
  if (to.length === 0) {
    throw new Error(
      "No report recipients configured. Set REPORT_RECIPIENTS or add them in the admin settings.",
    );
  }
  const from = await getFromAddress();

  const { error } = await resendClient().emails.send({
    from,
    to,
    subject: opts.subject,
    text: opts.intro,
    attachments: [{ filename: opts.filename, content: opts.pdf }],
  });

  if (error) {
    throw new Error(`Resend failed: ${JSON.stringify(error)}`);
  }
  return { sentTo: to };
}
