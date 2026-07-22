// Owner notifications previously routed through Manus's notification service.
// Wire this up to whatever you use for ops alerts (email via Resend/Postmark,
// a Slack webhook, etc.) — this is a safe no-op stub until then.
export type NotificationPayload = {
  title: string;
  content: string;
};

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  console.log(`[Notification] ${payload.title}: ${payload.content}`);
  // TODO: replace with a real email/Slack integration.
  return true;
}
