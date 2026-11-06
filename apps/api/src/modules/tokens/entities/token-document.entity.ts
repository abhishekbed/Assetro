import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum DocumentType {
  PROSPECTUS = 'prospectus',
  TERM_SHEET = 'term_sheet',
  INVESTOR_PRESENTATION = 'investor_presentation',
  LEGAL_AGREEMENT = 'legal_agreement',
  OTHER = 'other',
}

export enum DocumentVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Entity('token_documents')
export class TokenDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'token_id' })
  tokenId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, default: DocumentType.OTHER })
  type: DocumentType;

  @Column({ type: 'varchar', length: 50, default: DocumentVisibility.PRIVATE })
  visibility: DocumentVisibility;

  @Column({ type: 'varchar', length: 1024, name: 'file_path' })
  filePath: string;

  @Column({ type: 'varchar', length: 2048, name: 'file_url', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'varchar', length: 255, name: 'original_name' })
  originalName: string;

  @Column({ type: 'varchar', length: 100, name: 'mime_type' })
  mimeType: string;

  @Column({ type: 'bigint', name: 'file_size', default: 0 })
  fileSize: string;

  @Column({ type: 'uuid', name: 'uploaded_by', nullable: true })
  uploadedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
