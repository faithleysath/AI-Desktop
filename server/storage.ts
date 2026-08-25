export interface ObjectStorage {
  createUploadUrl(key: string, contentType: string, expiresIn?: number): string;
  createDownloadUrl(key: string, expiresIn?: number): string;
  stat(key: string): Promise<{ size: number; etag?: string; contentType?: string }>;
  delete(key: string): Promise<void>;
}

export class BunS3ObjectStorage implements ObjectStorage {
  private readonly client: Bun.S3Client;
  private readonly publicClient: Bun.S3Client;

  constructor() {
    const options = {
      endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET ?? "edudesk-private",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "edudesk",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "edudesk-secret",
    };
    this.client = new Bun.S3Client(options);
    this.publicClient = new Bun.S3Client({
      ...options,
      endpoint: process.env.S3_PUBLIC_ENDPOINT ?? options.endpoint,
    });
  }

  createUploadUrl(key: string, contentType: string, expiresIn = 900) {
    return this.publicClient.presign(key, {
      method: "PUT",
      type: contentType,
      expiresIn,
    });
  }

  createDownloadUrl(key: string, expiresIn = 300) {
    return this.publicClient.presign(key, { method: "GET", expiresIn });
  }

  async stat(key: string) {
    const stat = await this.client.stat(key);
    return { size: stat.size, etag: stat.etag, contentType: stat.type };
  }

  async delete(key: string) {
    await this.client.delete(key);
  }
}

export const objectStorage: ObjectStorage = new BunS3ObjectStorage();

export function buildObjectKey(organizationId: string, fileId: string, originalName: string) {
  const safeName = originalName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/^[.-]+/, "")
    .slice(-100);
  const now = new Date();
  return [
    "tenants",
    organizationId,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    fileId,
    safeName || "file",
  ].join("/");
}
