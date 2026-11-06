import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferApproval } from './entities/transfer-approval.entity';
import { Token } from '../tokens/entities/token.entity';
import { User } from '../auth/entities/user.entity';
import { TransferApprovalService } from './services/transfer-approval.service';
import { TransferApprovalController } from './controllers/transfer-approval.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferApproval, Token, User]),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [TransferApprovalController],
  providers: [TransferApprovalService],
  exports: [TransferApprovalService],
})
export class TransfersModule {}
