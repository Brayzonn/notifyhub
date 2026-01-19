import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import {
  SignupDto,
  SigninDto,
  VerifyOtpDto,
  ResendOtpDto,
} from '@/auth/dto/auth.dto';
import { AuthService } from '@/auth/auth.service';
import { CookieConfig } from '@/config/cookie.config';
import { ConfigService } from '@nestjs/config';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signupDto: SignupDto) {
    const result = await this.authService.signup(signupDto);

    return result;
  }
}
