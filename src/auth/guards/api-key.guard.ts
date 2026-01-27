import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    if (!this.isValidApiKeyFormat(apiKey)) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const customer = await this.prisma.customer.findUnique({
      where: { apiKeyHash },
      select: {
        id: true,
        email: true,
        plan: true,
        monthlyLimit: true,
        usageCount: true,
        usageResetAt: true,
        isActive: true,
        user: {
          select: {
            id: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!customer) {
      this.logger.warn(
        `Invalid API key attempt: ${apiKey.substring(0, 11)}...`,
      );
      throw new UnauthorizedException('Invalid API key');
    }

    if (customer.user.deletedAt) {
      this.logger.warn(`Deleted user attempted API access: ${customer.email}`);
      throw new ForbiddenException('Account has been deleted');
    }

    if (!customer.isActive) {
      this.logger.warn(
        `Inactive customer attempted API access: ${customer.email}`,
      );
      throw new ForbiddenException('Account is inactive');
    }

    if (customer.usageCount >= customer.monthlyLimit) {
      throw new ForbiddenException(
        `Monthly usage limit exceeded (${customer.usageCount}/${customer.monthlyLimit}). Upgrade your plan or wait for reset on ${customer.usageResetAt.toLocaleDateString()}.`,
      );
    }

    const now = new Date();
    if (customer.usageResetAt < now) {
      await this.resetMonthlyUsage(customer.id);
      customer.usageCount = 0;
      customer.usageResetAt = this.getNextResetDate();
      this.logger.log(`Reset monthly usage for customer: ${customer.email}`);
    }

    // Attach customer to request
    request['customer'] = {
      id: customer.id,
      email: customer.email,
      plan: customer.plan,
      monthlyLimit: customer.monthlyLimit,
      usageCount: customer.usageCount,
      usageResetAt: customer.usageResetAt,
    };

    return true;
  }

  private extractApiKey(request: Request): string | null {
    const authHeader = request.headers['authorization'];
    const apiKeyHeader = request.headers['x-api-key'] as string;

    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  private isValidApiKeyFormat(apiKey: string): boolean {
    return apiKey.startsWith('nh_') && apiKey.length === 67; // nh_ + 64 hex chars
  }

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
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }
}
