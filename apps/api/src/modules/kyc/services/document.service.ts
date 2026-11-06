import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycDocument, DocumentType } from '../entities/kyc-document.entity';
import { S3UploadService } from './s3-upload.service';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectRepository(KycDocument)
    private readonly documentRepository: Repository<KycDocument>,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async uploadDocument(
    submissionId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<KycDocument> {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size ${file.size} exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
      );
    }

    const { key, url } = await this.s3UploadService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      tenantId,
      submissionId,
    );

    const document = this.documentRepository.create({
      kycSubmissionId: submissionId,
      documentType,
      fileName: file.originalname,
      fileUrl: key,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    const saved = await this.documentRepository.save(document);
    this.logger.log(
      `Document uploaded: ${saved.id} (${documentType}) for submission ${submissionId}`,
    );

    return saved;
  }

  async getDocuments(submissionId: string): Promise<KycDocument[]> {
    return this.documentRepository.find({
      where: { kycSubmissionId: submissionId },
      order: { uploadedAt: 'DESC' },
    });
  }

  async getDownloadUrl(documentId: string): Promise<{ url: string; fileName: string }> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    const url = await this.s3UploadService.generatePresignedUrl(document.fileUrl);

    return { url, fileName: document.fileName };
  }
}
