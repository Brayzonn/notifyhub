import {
  Process,
  Processor,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.constants';
import { WebhookJobData, QueueService } from '../queue.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Processor(QUEUE_NAMES.WEBHOOK)
export class WebhookWorkerProcessor {
  private readonly logger = new Logger(WebhookWorkerProcessor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  @Process({
    concurrency: 5,
  })
  async processWebhookJob(job: Job<WebhookJobData>) {
    const { jobId, customerId, url, method, headers, payload } = job.data;

    this.logger.log(
      `Processing webhook job: ${jobId} (attempt ${job.attemptsMade + 1})`,
    );

    try {
      // Step 1: Update job status to 'processing'
      // await this.prisma.job.update({
      //   where: { id: jobId },
      //   data: {
      //     status: 'processing',
      //     startedAt: new Date(),
      //     attempts: job.attemptsMade + 1,
      //   },
      // });

      // Step 2: Make HTTP request
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
          timeout: 30000, // 30 seconds
          validateStatus: (status) => status >= 200 && status < 300,
        }),
      );

      // Step 3: Update job status to 'completed'
      // await this.prisma.job.update({
      //   where: { id: jobId },
      //   data: {
      //     status: 'completed',
      //     completedAt: new Date(),
      //   },
      // });

      // Step 4: Log delivery success
      // await this.prisma.deliveryLog.create({
      //   data: {
      //     jobId,
      //     attempt: job.attemptsMade + 1,
      //     status: 'success',
      //     response: {
      //       statusCode: response.status,
      //       body: response.data,
      //     },
      //   },
      // });

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

      // Log delivery failure
      // await this.prisma.deliveryLog.create({
      //   data: {
      //     jobId,
      //     attempt: job.attemptsMade + 1,
      //     status: 'failed',
      //     errorMessage: error.message,
      //     response: errorResponse,
      //   },
      // });

      // Determine if we should retry based on error type
      const shouldRetry = this.shouldRetryWebhook(error);

      if (!shouldRetry || job.attemptsMade >= 2) {
        // Don't retry 4xx errors or if max attempts reached
        await this.queueService.moveToDeadLetterQueue(job.data, error.mesnsage);

        // Update job status to 'failed'
        // await this.prisma.job.update({
        //   where: { id: jobId },
        //   data: {
        //     status: 'failed',
        //     errorMessage: error.message,
        //   },
        // });

        if (!shouldRetry) {
          this.logger.warn(
            `Not retrying webhook job ${jobId} - Client error (4xx)`,
          );
          return; // Don't throw, prevent retry
        }
      }

      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Determine if webhook should be retried based on error
   */
  private shouldRetryWebhook(error: any): boolean {
    // Don't retry client errors (4xx)
    if (
      error.response &&
      error.response.status >= 400 &&
      error.response.status < 500
    ) {
      return false;
    }

    // Retry server errors (5xx) and network errors
    return true;
  }

  @OnQueueActive()
  onActive(job: Job<WebhookJobData>) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onComplete(job: Job<WebhookJobData>) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnQueueFailed()
  onError(job: Job<WebhookJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
  }
}
