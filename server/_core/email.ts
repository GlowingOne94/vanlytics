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

// Notifies the Vanlytics owner of a new onboarding/setup service inquiry —
// intentionally goes to a fixed internal address, not anything
// user-configurable, since this is a lead notification, not a customer-facing
// transactional email.
export async function sendServiceInquiryEmail(data: {
  service: string;
  name: string;
  email: string;
  company: string;
  phone?: string;
  message?: string;
}) {
  await sendEmail({
    to: ENV.serviceInquiryNotifyEmail || ENV.resendFromEmail,
    subject: `New service inquiry: ${data.service} — ${data.company}`,
    html: `
      <p>New onboarding/setup service inquiry from the Vanlytics landing page.</p>
      <ul>
        <li><strong>Service:</strong> ${data.service}</li>
        <li><strong>Name:</strong> ${data.name}</li>
        <li><strong>Company:</strong> ${data.company}</li>
        <li><strong>Email:</strong> ${data.email}</li>
        <li><strong>Phone:</strong> ${data.phone || "—"}</li>
      </ul>
      ${data.message ? `<p><strong>Message:</strong><br>${data.message.replace(/\n/g, "<br>")}</p>` : ""}
      <p>Reply directly to this inquiry at <a href="mailto:${data.email}">${data.email}</a> to follow up and send a payment link if you decide to move forward.</p>
    `,
  });
}
