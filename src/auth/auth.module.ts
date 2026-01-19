import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { QuotaGuard } from './guards/quota.guard';
import { RedisModule } from '@/redis/redis.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ApiKeyGuard, RateLimitGuard, QuotaGuard],
  exports: [ApiKeyGuard, RateLimitGuard, QuotaGuard, JwtAuthGuard],
})
export class AuthModule {}
