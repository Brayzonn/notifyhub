import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DeliveryStatus, JobStatus } from '@prisma/client';
import { QUEUE_NAMES } from '../queue.constants';
import { EmailJobData, QueueService } from '../queue.service';
import { SendGridService } from '../../sendgrid/sendgrid.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor(QUEUE_NAMES.EMAIL, { concurrency: 5 })
export class EmailWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailWorkerProcessor.name);

  constructor(
    private readonly sendGridService: SendGridService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<any> {
    const { jobId, customerId, to, subject, body, from } = job.data;

    this.logger.log(
      `Processing email job: ${jobId} (attempt ${job.attemptsMade + 1})`,
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

      const response = await this.sendGridService.sendEmail({
        to,
        subject,
        body,
        from: from || 'noreply@notifyhub.com',
      });

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
          response: response,
        },
      });

      this.logger.log(`Email sent successfully: ${jobId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Email job failed: ${jobId} - ${error.message}`);

      await this.prisma.deliveryLog.create({
        data: {
          jobId,
          attempt: job.attemptsMade + 1,
          status: DeliveryStatus.FAILED,
          errorMessage: error.message,
        },
      });

      if (job.attemptsMade >= 2) {
        await this.queueService.moveToDeadLetterQueue(job.data, error.message);

        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: JobStatus.FAILED,
            errorMessage: error.message,
          },
        });
      }

      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job<EmailJobData>) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnWorkerEvent('completed')
  onComplete(job: Job<EmailJobData>) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onError(job: Job<EmailJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
  }
}
