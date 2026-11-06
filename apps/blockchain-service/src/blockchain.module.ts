import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { ProviderService } from './services/provider.service';
import { ContractDeployerService } from './services/contract-deployer.service';
import { ContractInteractionService } from './services/contract-interaction.service';
import { EventListenerService } from './services/event-listener.service';
import { TransactionManagerService } from './services/transaction-manager.service';
import { GasEstimatorService } from './services/gas-estimator.service';
import { BlockchainController } from './controllers/blockchain.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host =
          configService.get<string>('DB_HOST') ??
          configService.get<string>('DATABASE_HOST') ??
          'localhost';
        const port = Number(
          configService.get<string>('DB_PORT') ??
            configService.get<string>('DATABASE_PORT') ??
            5432,
        );
        const username =
          configService.get<string>('DB_USERNAME') ??
          configService.get<string>('DB_USER') ??
          configService.get<string>('DATABASE_USER') ??
          configService.get<string>('DATABASE_USERNAME') ??
          'assetro';
        const password =
          configService.get<string>('DB_PASSWORD') ??
          configService.get<string>('DATABASE_PASSWORD') ??
          'change_me_in_production';
        const database =
          configService.get<string>('DB_NAME') ??
          configService.get<string>('DB_DATABASE') ??
          configService.get<string>('DATABASE_NAME') ??
          'assetro_platform';

        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          entities: [Transaction],
          synchronize: false,
          logging: configService.get<string>('NODE_ENV') !== 'production',
        };
      },
    }),
    TypeOrmModule.forFeature([Transaction]),
  ],
  controllers: [BlockchainController],
  providers: [
    ProviderService,
    ContractDeployerService,
    ContractInteractionService,
    EventListenerService,
    TransactionManagerService,
    GasEstimatorService,
  ],
  exports: [
    ProviderService,
    ContractDeployerService,
    ContractInteractionService,
    EventListenerService,
    TransactionManagerService,
    GasEstimatorService,
  ],
})
export class BlockchainModule {}
