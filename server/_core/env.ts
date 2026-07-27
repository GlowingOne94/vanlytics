export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Public base URL of the deployed app — used to build links in emails.
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // Transactional email (password reset, invites) via Resend.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "Vanlytics <onboarding@resend.dev>",
  // Stripe billing — leave keys blank until a Stripe account is set up;
  // billing features safely no-op with a clear error until configured.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceStarter: process.env.STRIPE_PRICE_STARTER ?? "",
  stripePriceFleet: process.env.STRIPE_PRICE_FLEET ?? "",
  stripePriceFleetPro: process.env.STRIPE_PRICE_FLEET_PRO ?? "",
  // LLM provider config (OpenAI-compatible chat completions API)
  llmApiUrl: process.env.LLM_API_URL ?? "https://api.openai.com",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmDefaultModel: process.env.LLM_DEFAULT_MODEL ?? "gpt-4o-mini",
  // Object storage (S3-compatible: AWS S3, Cloudflare R2, etc.)
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT ?? "", // leave blank for real AWS S3
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicUrl: process.env.S3_PUBLIC_URL ?? "", // public base URL for serving files (CDN or bucket URL)
};
