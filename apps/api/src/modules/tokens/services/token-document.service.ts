import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import {
  TokenDocument,
  DocumentType,
  DocumentVisibility,
} from '../entities/token-document.entity';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class TokenDocumentService {
  private readonly logger = new Logger(TokenDocumentService.name);
  private readonly uploadsRoot: string;
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(TokenDocument)
    private readonly docRepo: Repository<TokenDocument>,
    private readonly config: ConfigService,
  ) {
    this.uploadsRoot = this.config.get<string>('UPLOADS_PATH')
      ?? path.join(process.cwd(), 'uploads');
    this.baseUrl = this.config.get<string>('API_BASE_URL')
      ?? `http://localhost:${this.config.get<string>('PORT', '3000')}`;
  }

  async listDocuments(tokenId: string, publicOnly = false): Promise<TokenDocument[]> {
    return this.docRepo.find({
      where: publicOnly ? { tokenId, visibility: DocumentVisibility.PUBLIC } : { tokenId },
      order: { createdAt: 'DESC' },
    });
  }

  async saveDocument(
    tokenId: string,
    file: Express.Multer.File,
    dto: { name: string; type: DocumentType; visibility: DocumentVisibility },
    uploadedBy?: string,
  ): Promise<TokenDocument> {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} not allowed. Use PDF or DOCX.`);
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File exceeds maximum size of 50 MB');
    }

    const ext = path.extname(file.originalname);
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}-${safeBase}`;
    const relativeDir = path.join('tokens', tokenId);
    const absoluteDir = path.join(this.uploadsRoot, relativeDir);

    fs.mkdirSync(absoluteDir, { recursive: true });
    const absolutePath = path.join(absoluteDir, fileName);
    fs.writeFileSync(absolutePath, file.buffer);

    const relativePath = path.join(relativeDir, fileName);
    const fileUrl = `${this.baseUrl}/api/v1/uploads/${relativePath.replace(/\\/g, '/')}`;

    const doc = this.docRepo.create({
      tokenId,
      name: dto.name,
      type: dto.type,
      visibility: dto.visibility,
      filePath: relativePath,
      fileUrl,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: String(file.size),
      uploadedBy: uploadedBy ?? null,
    });

    const saved = await this.docRepo.save(doc);
    this.logger.log(`[Doc] Saved ${saved.id} → ${relativePath} (${file.size} bytes)`);
    return saved;
  }

  async deleteDocument(id: string, tokenId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id, tokenId } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    const absolutePath = path.join(this.uploadsRoot, doc.filePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      this.logger.log(`[Doc] Deleted file ${absolutePath}`);
    }

    await this.docRepo.remove(doc);
  }

  async getFilePath(id: string, tokenId: string): Promise<{ absolutePath: string; mimeType: string; originalName: string }> {
    const doc = await this.docRepo.findOne({ where: { id, tokenId } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    const absolutePath = path.join(this.uploadsRoot, doc.filePath);
    if (!fs.existsSync(absolutePath)) throw new NotFoundException('File not found on disk');

    return { absolutePath, mimeType: doc.mimeType, originalName: doc.originalName };
  }
}
