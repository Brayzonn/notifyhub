import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './auth/guards/api-key.guard';

@Controller('')
@UseGuards(ApiKeyGuard)
export class AppController {
  @Get('ping')
  ping() {
    return {
      message: 'Pong',
    };
  }

  @Get('info')
  getApiInfo() {
    return {
      name: 'NotifyHub API',
      version: '1.0.0',
      description:
        'Notification infrastructure service for emails and webhooks',
      documentation: 'https://docs.notifyhub.com',
    };
  }
}
