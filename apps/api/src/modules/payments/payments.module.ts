import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { User } from '../auth/entities/user.entity';
import { Token } from '../tokens/entities/token.entity';
import { CapTable } from '../tokens/entities/cap-table.entity';
import { PaymentService } from './services/payment.service';
import { StripeService } from './services/stripe.service';
import { PaymentController } from './controllers/payment.controller';
import { WebhookController } from './controllers/webhook.controller';
import { TokensModule } from '../tokens/tokens.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, User, Token, CapTable]),
    forwardRef(() => TokensModule),
    forwardRef(() => KycModule),
  ],
  controllers: [PaymentController, WebhookController],
  providers: [PaymentService, StripeService],
  exports: [PaymentService],
})
export class PaymentsModule {}
