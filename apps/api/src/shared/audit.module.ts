import { Global, Module } from '@nestjs/common';
import { AuditLogService } from '../modules/admin/services/audit-log.service';

@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
