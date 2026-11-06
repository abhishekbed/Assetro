import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainModule } from './blockchain.module';

async function bootstrap() {
  const logger = new Logger('BlockchainService');
  const app = await NestFactory.create(BlockchainModule);

  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', '*'),
    credentials: true,
  });

  app.setGlobalPrefix('api/v1/blockchain');

  const port = configService.get<number>('BLOCKCHAIN_SERVICE_PORT', 3050);
  await app.listen(port);
  logger.log(`Blockchain service is running on port ${port}`);
}

bootstrap();
