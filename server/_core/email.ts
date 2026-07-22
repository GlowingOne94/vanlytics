// Transactional email via Resend (https://resend.com). Used for password
// reset links and team invites.
import { ENV } from "./env";

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!ENV.resendApiKey) {
    console.warn(`[Email] RESEND_API_KEY not configured — would have sent "${subject}" to ${to}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ENV.resendFromEmail,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[Email] Failed to send to ${to} (${res.status}): ${detail}`);
  }
}

export async function sendPasswordResetEmail({ to, token }: { to: string; token: string }) {
  const url = `${ENV.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: "Reset your Vanlytics password",
    html: `
      <p>We received a request to reset your Vanlytics password.</p>
      <p><a href="${url}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
    `,
  });
}

export async function sendInviteEmail({ to, orgName, token }: { to: string; orgName: string; token: string }) {
  const url = `${ENV.appUrl}/accept-invite?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: `You've been invited to join ${orgName} on Vanlytics`,
    html: `
      <p>You've been invited to join <strong>${orgName}</strong> on Vanlytics.</p>
      <p><a href="${url}">Click here to accept the invite</a>. This link expires in 7 days.</p>
    `,
  });
}
