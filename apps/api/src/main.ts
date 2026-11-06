import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('API');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
    rawBody: true, // required for Stripe webhook signature verification
  });

  const port = process.env.PORT || 3000;

  // Serve uploaded documents as static files under /api/v1/uploads/* and /uploads/*
  const uploadsRoot = process.env.UPLOADS_PATH ?? path.join(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsRoot, { recursive: true });
  app.useStaticAssets(uploadsRoot, { prefix: '/api/v1/uploads' });
  app.useStaticAssets(uploadsRoot, { prefix: '/uploads' });

  app.setGlobalPrefix('api/v1');

  const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:3002,http://localhost:3003';
  app.enableCors({
    origin: corsOrigins === '*' ? true : corsOrigins.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-User-ID',
      'x-user-id',
      'x-tenant-id',
      'X-Request-ID',
      'X-Wallet-Address',
      'x-wallet-address',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Health check endpoint (outside /api/v1 prefix)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      service: 'assetro-api',
      timestamp: new Date().toISOString(),
    });
  });

  await app.listen(port);

  logger.log(`Assetro API running on http://localhost:${port}`);
  logger.log(`Routes: /api/v1/{auth,tokens,compliance,kyc,payments,notifications,admin}`);
  logger.log(`Health: http://localhost:${port}/health`);
}

bootstrap();
