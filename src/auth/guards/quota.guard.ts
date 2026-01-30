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
    billingCycleStartAt: Date;
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

    // Check if billing cycle has ended and needs reset
    if (customer.usageResetAt < now) {
      const nextResetDate = this.getNextResetDate();

      await this.resetMonthlyUsage(customer.id, nextResetDate);

      // Update customer object in memory for current request
      customer.usageCount = 0;
      customer.usageResetAt = nextResetDate;
      customer.billingCycleStartAt = now;

      this.logger.log(
        `Reset monthly usage for customer: ${customer.email}. New cycle: ${now.toISOString()} to ${nextResetDate.toISOString()}`,
      );
    }

    // Check if usage limit is exceeded
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

    // Increment usage count
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    // Update in-memory counter for accurate logging
    customer.usageCount += 1;

    this.logger.debug(
      `Usage incremented for ${customer.email}: ${customer.usageCount}/${customer.monthlyLimit}`,
    );

    return true;
  }

  /**
   * Reset usage count for new billing period
   */
  private async resetMonthlyUsage(
    customerId: string,
    nextResetDate: Date,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        usageCount: 0,
        usageResetAt: nextResetDate,
        billingCycleStartAt: now,
      },
    });
  }

  /**
   * Get the next reset date (first day of next month at midnight UTC)
   */
  private getNextResetDate(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
  }

  /**
   * Get usage stats for a customer
   */
  async getUsageStats(customerId: string): Promise<{
    usage: number;
    limit: number;
    remaining: number;
    resetAt: Date;
    billingCycleStartAt: Date;
    percentageUsed: number;
  }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        usageCount: true,
        monthlyLimit: true,
        usageResetAt: true,
        billingCycleStartAt: true,
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
      billingCycleStartAt: customer.billingCycleStartAt,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
    };
  }
}
