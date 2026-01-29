import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RedisService } from '@/redis/redis.service';
import { Request } from 'express';
import { UserRole } from '@prisma/client';

interface UserRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(UserRateLimitGuard.name);

  private readonly rateLimits: Record<UserRole, number> = {
    [UserRole.USER]: 60,
    [UserRole.ADMIN]: 300,
  };
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const user = request.user;

    if (!user) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const role = user.role || UserRole.USER;
    const isAllowed = await this.checkRateLimit(user.id, role);

    if (!isAllowed) {
      const limit = this.rateLimits[role];
      this.logger.warn(`Rate limit exceeded for user: ${user.id}`);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          error: 'Too Many Requests',
          limit,
          window: '1 minute',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Check and increment rate limit counter
   */
  private async checkRateLimit(
    userId: string,
    role: UserRole,
  ): Promise<boolean> {
    const key = `user_rate_limit:${userId}:minute`;
    const limit = this.rateLimits[role];
    const ttl = 60; // 1 minute

    try {
      const currentCount = await this.redis.get(key);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      if (count >= limit) return false;

      if (count === 0) {
        await this.redis.set(key, '1', ttl);
      } else {
        const client = this.redis.getClient();
        await client.incr(key);
      }

      return true;
    } catch (error) {
      this.logger.error(`Rate limit check failed: ${error.message}`);
      return true;
    }
  }

  /**
   * Get remaining requests for a user
   */
  async getRemainingRequests(
    userId: string,
    role: string,
  ): Promise<{ remaining: number; limit: number; resetIn: number }> {
    const key = `user_rate_limit:${userId}:minute`;
    const limit = this.rateLimits[role];

    const currentCount = await this.redis.get(key);
    const count = currentCount ? parseInt(currentCount, 10) : 0;
    const remaining = Math.max(0, limit - count);

    const client = this.redis.getClient();
    const ttl = await client.ttl(key);
    const resetIn = ttl > 0 ? ttl : 60;

    return { remaining, limit, resetIn };
  }
}
