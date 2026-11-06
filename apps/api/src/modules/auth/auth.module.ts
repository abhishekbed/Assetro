import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { IssuerLead } from '../issuer-leads/entities/issuer-lead.entity';
import { AuthService } from './services/auth.service';
import { JwtTokenService } from './services/jwt.service';
import { AuthController } from './controllers/auth.controller';
import { IssuerWalletController } from './controllers/issuer-wallet.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserRepository } from './repositories/user.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    TypeOrmModule.forFeature([User, IssuerLead]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'assetro-dev-secret-key-change-in-production'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '86400s') },
      }),
    }),
  ],
  controllers: [AuthController, IssuerWalletController],
  providers: [AuthService, JwtTokenService, JwtStrategy, UserRepository],
  exports: [AuthService, JwtTokenService],
})
export class AuthModule {}
