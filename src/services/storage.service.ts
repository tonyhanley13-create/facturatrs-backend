import path from 'path';
import fs from 'fs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
const CLOUD_ENABLED = process.env.CLOUD_STORAGE_ENABLED === 'true';

let s3Client: S3Client | null = null;
if (CLOUD_ENABLED && process.env.B2_ENDPOINT && process.env.B2_ACCESS_KEY && process.env.B2_SECRET_KEY) {
  s3Client = new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: process.env.B2_REGION || 'us-west-004',
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY,
      secretAccessKey: process.env.B2_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

export type FileType = 'xml' | 'pdf' | 'signed_xml';

function getRelativePath(companyId: number, invoiceId: number, type: FileType): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = type === 'pdf' ? 'pdf' : 'xml';
  return `invoices/${companyId}/${year}/${month}/${invoiceId}_${type}.${ext}`;
}

function getAbsolutePath(relative: string): string {
  return path.join(STORAGE_PATH, relative);
}

export async function saveInvoiceFile(
  companyId: number,
  invoiceId: number,
  type: FileType,
  content: string | Buffer,
): Promise<{ localPath: string; cloudKey?: string }> {
  const relativePath = getRelativePath(companyId, invoiceId, type);
  const absolutePath = getAbsolutePath(relativePath);

  // Ensure directory exists
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write locally
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  fs.writeFileSync(absolutePath, buffer);

  let cloudKey: string | undefined;

  // Upload to cloud (Backblaze B2)
  if (s3Client && process.env.B2_BUCKET) {
    try {
      const cmd = new PutObjectCommand({
        Bucket: process.env.B2_BUCKET,
        Key: relativePath,
        Body: buffer,
        ContentType: type === 'pdf' ? 'application/pdf' : 'application/xml',
      });
      await s3Client.send(cmd);
      cloudKey = relativePath;
    } catch (err) {
      console.error(`[Storage] Error subiendo a B2: ${relativePath}`, err);
    }
  }

  return { localPath: relativePath, cloudKey };
}

export async function getInvoiceFile(
  companyId: number,
  invoiceId: number,
  type: FileType,
): Promise<{ stream: Readable; contentType: string } | null> {
  const relativePath = getRelativePath(companyId, invoiceId, type);
  const absolutePath = getAbsolutePath(relativePath);
  const contentType = type === 'pdf' ? 'application/pdf' : 'application/xml';

  // Try local first
  if (fs.existsSync(absolutePath)) {
    return { stream: fs.createReadStream(absolutePath), contentType };
  }

  // Fallback to cloud
  if (s3Client && process.env.B2_BUCKET) {
    try {
      const cmd = new GetObjectCommand({ Bucket: process.env.B2_BUCKET, Key: relativePath });
      const response = await s3Client.send(cmd);
      if (response.Body) {
        return { stream: response.Body as Readable, contentType };
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function deleteInvoiceFile(companyId: number, invoiceId: number, type: FileType): Promise<void> {
  const relativePath = getRelativePath(companyId, invoiceId, type);
  const absolutePath = getAbsolutePath(relativePath);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  if (s3Client && process.env.B2_BUCKET) {
    try {
      const cmd = new PutObjectCommand({
        Bucket: process.env.B2_BUCKET,
        Key: relativePath,
        Body: '',
      });
      // B2 no tiene DeleteObjectCommand fácil, sobrescribir con vacío
      await s3Client.send(cmd);
    } catch {
      // ignorar
    }
  }
}

export function getStorageInfo() {
  const total = fs.existsSync(STORAGE_PATH)
    ? getDirectorySize(STORAGE_PATH)
    : 0;
  return {
    localPath: STORAGE_PATH,
    localSizeBytes: total,
    cloudEnabled: CLOUD_ENABLED && !!s3Client,
    cloudEndpoint: process.env.B2_ENDPOINT || null,
    cloudBucket: process.env.B2_BUCKET || null,
  };
}

function getDirectorySize(dir: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {
    // ignorar
  }
  return size;
}
