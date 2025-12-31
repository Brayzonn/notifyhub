import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobStatus, DeliveryStatus } from '@prisma/client';
import { QUEUE_NAMES } from '../queue.constants';
import { WebhookJobData, QueueService } from '../queue.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Processor(QUEUE_NAMES.WEBHOOK, {
  concurrency: 5,
})
export class WebhookWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookWorkerProcessor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<any> {
    const { jobId, url, method, headers, payload } = job.data;

    this.logger.log(
      `Processing webhook job: ${jobId} (attempt ${job.attemptsMade + 1})`,
    );

    try {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PROCESSING,
          startedAt: new Date(),
          attempts: job.attemptsMade + 1,
        },
      });

      const response = await firstValueFrom(
        this.httpService.request({
          url,
          method: method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'NotifyHub/1.0',
            ...headers,
          },
          data: payload,
          timeout: 30000,
          validateStatus: (status) => status >= 200 && status < 300,
        }),
      );

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await this.prisma.deliveryLog.create({
        data: {
          jobId,
          attempt: job.attemptsMade + 1,
          status: DeliveryStatus.SUCCESS,
          response: {
            statusCode: response.status,
            body: response.data,
          },
        },
      });

      this.logger.log(
        `Webhook delivered successfully: ${jobId} - Status: ${response.status}`,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`Webhook job failed: ${jobId} - ${error.message}`);

      const errorResponse = error.response
        ? {
            statusCode: error.response.status,
            body: error.response.data,
          }
        : null;

      await this.prisma.deliveryLog.create({
        data: {
          jobId,
          attempt: job.attemptsMade + 1,
          status: DeliveryStatus.FAILED,
          errorMessage: error.message,
          response: errorResponse ?? undefined,
        },
      });

      const shouldRetry = this.shouldRetryWebhook(error);

      if (!shouldRetry || job.attemptsMade >= 2) {
        await this.queueService.moveToDeadLetterQueue(job.data, error.message);

        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: JobStatus.FAILED,
            errorMessage: error.message,
          },
        });

        if (!shouldRetry) {
          this.logger.warn(
            `Not retrying webhook job ${jobId} - Client error (4xx)`,
          );
          return;
        }
      }

      throw error;
    }
  }

  private shouldRetryWebhook(error: any): boolean {
    if (
      error.response &&
      error.response.status >= 400 &&
      error.response.status < 500
    ) {
      return false;
    }

    return true;
  }

  @OnWorkerEvent('active')
  onActive(job: Job<WebhookJobData>) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnWorkerEvent('completed')
  onComplete(job: Job<WebhookJobData>) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onError(job: Job<WebhookJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
  }
}
