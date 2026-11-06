import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface AuditLogEntry {
  id?: string;
  tenant_id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  timestamp?: Date;
}

export interface AuditLogQueryParams {
  tenantId?: string;
  actor?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class AuditLogService implements OnModuleInit {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS public.audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(100),
          actor_id VARCHAR(255),
          actor_role VARCHAR(50),
          action VARCHAR(100),
          resource_type VARCHAR(100),
          resource_id VARCHAR(255),
          details JSONB,
          ip_address VARCHAR(50),
          timestamp TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      this.logger.log('Audit logs table ensured in public schema');
    } catch (error) {
      this.logger.error(`Failed to create audit_logs table: ${(error as Error).message}`);
    }
  }

  async create(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    try {
      const result = await this.dataSource.query(
        `INSERT INTO public.audit_logs (tenant_id, actor_id, actor_role, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          entry.tenant_id,
          entry.actor_id,
          entry.actor_role,
          entry.action,
          entry.resource_type,
          entry.resource_id ?? null,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.ip_address ?? null,
        ],
      );

      this.logger.debug(
        `Audit log: ${entry.actor_id} ${entry.action} ${entry.resource_type} ${entry.resource_id ?? ''}`,
      );

      return result[0];
    } catch (error) {
      this.logger.error(`Failed to save audit log: ${(error as Error).message}`);
      throw error;
    }
  }

  async query(params: AuditLogQueryParams): Promise<PaginatedAuditLogs> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      values.push(params.tenantId);
    }
    if (params.actor) {
      conditions.push(`actor_id = $${paramIndex++}`);
      values.push(params.actor);
    }
    if (params.action) {
      conditions.push(`action ILIKE $${paramIndex++}`);
      values.push(`${params.action}%`);
    }
    if (params.resource) {
      conditions.push(`resource_type = $${paramIndex++}`);
      values.push(params.resource);
    }
    if (params.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(params.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM public.audit_logs ${whereClause}`,
      values,
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const data = await this.dataSource.query(
      `SELECT * FROM public.audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...values, limit, offset],
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
