import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const getUploadsBase = () => process.env.UPLOADS_PATH ?? path.join(process.cwd(), 'uploads');
const getBaseUrl = () => {
  const envUrl = process.env.API_BASE_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/+$/, '');
  }
  return '';
};

@Injectable()
export class S3UploadService {
  private readonly logger = new Logger(S3UploadService.name);

  async upload(
    file: Buffer,
    fileName: string,
    mimeType: string,
    tenantId: string,
    submissionId: string,
  ): Promise<{ key: string; url: string }> {
    const key = `${tenantId}/kyc/${submissionId}/${Date.now()}-${fileName}`;
    const filePath = path.join(getUploadsBase(), key);
    const dirPath = path.dirname(filePath);

    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, file);

    this.logger.log(`File saved locally: ${filePath}`);

    const base = getBaseUrl();
    const relativePath = `/api/v1/uploads/${key.replace(/\\/g, '/')}`;
    const url = base ? `${base}${relativePath}` : relativePath;
    return { key, url };
  }

  async generatePresignedUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
    if (!key) return '';
    if (key.startsWith('http://localhost') || key.startsWith('http://127.0.0.1')) {
      const parsed = new URL(key);
      const base = getBaseUrl();
      return base ? `${base}${parsed.pathname}` : parsed.pathname;
    }
    if (key.startsWith('http://') || key.startsWith('https://')) return key;
    const base = getBaseUrl();
    const cleanKey = key.startsWith('/') ? key : `/api/v1/uploads/${key.replace(/\\/g, '/')}`;
    return base ? `${base}${cleanKey}` : cleanKey;
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(getUploadsBase(), key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`File deleted: ${filePath}`);
    }
  }
}
