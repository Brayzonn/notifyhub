import { Controller, Get } from '@nestjs/common';

@Controller('')
export class AppController {
  @Get('ping')
  ping() {
    return {
      success: true,
      message: 'NotifyHub API is running',
      timestamp: new Date().toISOString(),
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
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    };
  }
}
