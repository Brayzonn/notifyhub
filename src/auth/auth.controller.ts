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

  @Public()
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(
    @Body() signinDto: SigninDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.signin(signinDto);

    response.cookie(
      'refreshToken',
      result.tokens.refreshToken,
      CookieConfig.getRefreshTokenOptions(this.configService),
    );

    return result;
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyOtp(verifyOtpDto);

    response.cookie(
      'refreshToken',
      result.tokens.refreshToken,
      CookieConfig.getRefreshTokenOptions(this.configService),
    );

    return result;
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    const result = await this.authService.resendOtp(resendOtpDto);

    return result;
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.refreshToken(refreshToken);

    response.cookie(
      'refreshToken',
      result.refreshToken,
      CookieConfig.getRefreshTokenOptions(this.configService),
    );

    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.logout(refreshToken);

    const cookieOptions = CookieConfig.getRefreshTokenOptions(
      this.configService,
    );

    response.clearCookie('refreshToken', cookieOptions);

    return result;
  }
}
