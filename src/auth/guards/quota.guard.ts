import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { CustomerPlan } from '@prisma/client';

interface CustomerRequest extends Request {
  customer: {
    id: string;
    email: string;
    plan: CustomerPlan;
    monthlyLimit: number;
    usageCount: number;
    usageResetAt: Date;
  };
}

@Injectable()
export class QuotaGuard implements CanActivate {
  private readonly logger = new Logger(QuotaGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const customer = request.customer;

    if (!customer) {
      throw new HttpException(
        'Customer not authenticated',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const now = new Date();
    if (customer.usageResetAt < now) {
      await this.resetMonthlyUsage(customer.id);
      customer.usageCount = 0;
      customer.usageResetAt = this.getNextResetDate();
      this.logger.log(`Reset monthly usage for customer: ${customer.email}`);
    }

    if (customer.usageCount >= customer.monthlyLimit) {
      this.logger.warn(
        `Usage limit exceeded for customer: ${customer.email} (${customer.usageCount}/${customer.monthlyLimit})`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        message: `Monthly usage limit exceeded (${customer.usageCount}/${customer.monthlyLimit}). Upgrade your plan or wait for reset on ${customer.usageResetAt.toLocaleDateString()}.`,
        error: 'Forbidden',
      });
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        usageCount: {
          increment: 1,
        },
      },
      select: {
        usageCount: true,
      },
    });

    return true;
  }

  /**
   * Reset usage count for new billing period
   */
  private async resetMonthlyUsage(customerId: string): Promise<void> {
    const nextResetDate = this.getNextResetDate();

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        usageCount: 0,
        usageResetAt: nextResetDate,
      },
    });
  }

  private getNextResetDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  /**
   * Get usage stats for a customer
   */
  async getUsageStats(customerId: string): Promise<{
    usage: number;
    limit: number;
    remaining: number;
    resetAt: Date;
    percentageUsed: number;
  }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        usageCount: true,
        monthlyLimit: true,
        usageResetAt: true,
      },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const remaining = Math.max(0, customer.monthlyLimit - customer.usageCount);
    const percentageUsed = (customer.usageCount / customer.monthlyLimit) * 100;

    return {
      usage: customer.usageCount,
      limit: customer.monthlyLimit,
      remaining,
      resetAt: customer.usageResetAt,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
    };
  }
}
