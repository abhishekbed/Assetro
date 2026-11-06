import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorporateAction } from './entities/corporate-action.entity';
import { CorporateActionVote } from './entities/corporate-action-vote.entity';
import { CapTable } from '../tokens/entities/cap-table.entity';
import { Token } from '../tokens/entities/token.entity';
import { CorporateActionsService } from './services/corporate-actions.service';
import { CorporateActionsController } from './controllers/corporate-actions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CorporateAction, CorporateActionVote, CapTable, Token])],
  controllers: [CorporateActionsController],
  providers: [CorporateActionsService],
  exports: [CorporateActionsService],
})
export class CorporateActionsModule {}
