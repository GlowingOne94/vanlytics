// Direct S3-compatible object storage (works with AWS S3, Cloudflare R2, etc.)
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getS3Client() {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
    throw new Error(
      "Storage config missing: set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY"
    );
  }
  return new S3Client({
    region: ENV.s3Region,
    endpoint: ENV.s3Endpoint || undefined, // undefined = real AWS S3; set for R2/MinIO/etc.
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function publicUrlFor(key: string): string {
  if (ENV.s3PublicUrl) {
    return `${ENV.s3PublicUrl.replace(/\/+$/, "")}/${key}`;
  }
  // Fall back to the standard virtual-hosted-style S3 URL.
  return `https://${ENV.s3Bucket}.s3.${ENV.s3Region}.amazonaws.com/${key}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));

  await client.send(new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    Body: typeof data === "string" ? Buffer.from(data) : data,
    ContentType: contentType,
  }));

  return { key, url: publicUrlFor(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: publicUrlFor(key) };
}

// Use this instead of storageGet when the bucket is private and files should
// only be reachable via a short-lived, expiring link.
export async function storageGetSignedUrl(relKey: string, expiresInSeconds = 3600): Promise<string> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const command = new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
