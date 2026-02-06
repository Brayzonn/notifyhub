import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { AuthenticatedCustomer } from '../interfaces/api-guard.interface';
import { PLAN_LIMITS } from '@/common/constants/plans.constants';
import { CustomerPlan } from '@prisma/client';

interface CustomerRequest extends Request {
  customer: AuthenticatedCustomer;
}

@Injectable()
export class CustomerRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(CustomerRateLimitGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const customer = request.customer;

    if (!customer) {
      throw new HttpException(
        'Customer not authenticated',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const { id: customerId, plan } = customer;
    const limit = PLAN_LIMITS[plan].rateLimit;

    const isAllowed = await this.checkRateLimit(customerId, limit);

    if (!isAllowed) {
      this.logger.warn(`Rate limit exceeded for customer: ${customerId}`);

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

  private async checkRateLimit(
    customerId: string,
    limit: number,
  ): Promise<boolean> {
    const key = `rate_limit:${customerId}:minute`;
    const ttl = 60;

    try {
      const currentCount = await this.redis.get(key);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      if (count >= limit) {
        return false;
      }

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

  async getRemainingRequests(
    customerId: string,
    plan: CustomerPlan,
  ): Promise<{ remaining: number; limit: number; resetIn: number }> {
    const key = `rate_limit:${customerId}:minute`;
    const limit = PLAN_LIMITS[plan].rateLimit;

    const currentCount = await this.redis.get(key);
    const count = currentCount ? parseInt(currentCount, 10) : 0;
    const remaining = Math.max(0, limit - count);

    const client = this.redis.getClient();
    const ttl = await client.ttl(key);
    const resetIn = ttl > 0 ? ttl : 60;

    return {
      remaining,
      limit,
      resetIn,
    };
  }
}
