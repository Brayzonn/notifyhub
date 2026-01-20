import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '@/prisma/prisma.service';
import {
  SignupDto,
  SigninDto,
  VerifyOtpDto,
  ResendOtpDto,
  JwtPayload,
} from '@/auth/dto/auth.dto';
import { User, AuthProvider } from '@prisma/client';
import { AuthResponse, AuthTokens } from '@/auth/interfaces/auth.interface';
import { RedisService } from '@/redis/redis.service';
import { EmailService } from '@/email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly MAX_ACTIVE_SESSIONS = 5;
  private readonly JWT_REFRESH_SECRET: string;
  private readonly JWT_REFRESH_EXPIRES_IN: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private emailService: EmailService,
  ) {
    this.JWT_REFRESH_SECRET = this.configService.get('JWT_REFRESH_SECRET', '');
    this.JWT_REFRESH_EXPIRES_IN = this.configService.get(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );
  }

  /**
   * Signup - Create account and send OTP
   */
  async signup(signupDto: SignupDto): Promise<{ email: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: signupDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await argon2.hash(signupDto.password);

    const user = await this.prisma.user.create({
      data: {
        email: signupDto.email,
        password: hashedPassword,
        name: signupDto.name,
        company: signupDto.company,
        provider: AuthProvider.EMAIL,
        emailVerified: false,
      },
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await this.redis.set(`otp:${user.email}`, otp, 600);

    try {
      await this.emailService.sendOtpEmail({
        email: user.email,
        otp,
        expiresInMinutes: 10,
      });
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } });
      await this.redis.del(`otp:${user.email}`);
      throw new BadRequestException('Failed to send verification email');
    }

    return { email: user.email };
  }

  /**
   * Signin - Authenticate user
   */
  async signin(signinDto: SigninDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: signinDto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email.');
    }

    const isPasswordValid = await argon2.verify(
      user.password,
      signinDto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activeTokens = await this.prisma.refreshToken.count({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeTokens >= this.MAX_ACTIVE_SESSIONS) {
      const oldestToken = await this.prisma.refreshToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });

      if (oldestToken) {
        await this.prisma.refreshToken.delete({
          where: { id: oldestToken.id },
        });
      }
    }

    const tokens = await this.generateTokens(user);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * Verify OTP - complete signup process
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: verifyOtpDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    const storedOtp = await this.redis.get(`otp:${user.email}`);

    if (!storedOtp) {
      throw new UnauthorizedException('OTP expired. Please request a new one.');
    }

    if (storedOtp !== verifyOtpDto.otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const verifyUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    await this.redis.del(`otp:${user.email}`);

    const tokens = await this.generateTokens(verifyUser);

    await this.prisma.refreshToken.create({
      data: {
        userId: verifyUser.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: this.sanitizeUser(verifyUser),
      tokens,
    };
  }

  /**
   * Resend OTP
   */
  async resendOtp(resendOtpDto: ResendOtpDto): Promise<{ expiresIn: number }> {
    const user = await this.prisma.user.findUnique({
      where: { email: resendOtpDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    const resendKey = `otp-resend:${user.email}`;
    const resendCount = await this.redis.get(resendKey);

    if (resendCount && parseInt(resendCount) >= 3) {
      throw new BadRequestException(
        'Too many resend requests. Try again in 10 minutes.',
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(`otp:${user.email}`, otp, 600);

    const currentCount = await this.redis.getClient().incr(resendKey);
    if (currentCount === 1) {
      await this.redis.getClient().expire(resendKey, 600);
    }

    await this.emailService.sendOtpEmail({
      email: user.email,
      otp,
      expiresInMinutes: 10,
    });

    this.logger.log(`Resent OTP for ${user.email}: ${otp}`);

    return { expiresIn: 600 };
  }

  /**
   * Refresh access token
   */
  async refreshToken(token: string): Promise<AuthTokens> {
    this.verifyRefreshToken(token);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    const newTokens = await this.generateTokens(storedToken.user);

    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    await this.prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        token: newTokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return newTokens;
  }

  /**
   * Logout - Invalidate refresh token
   */
  async logout(token: string): Promise<void> {
    try {
      await this.prisma.refreshToken.delete({ where: { token } });
      this.logger.log('User logged out successfully');
    } catch (error) {
      this.logger.warn('Refresh token not found during logout');
    }
  }

  /**
   * ══════════════════════════════════════════════════════════════════════
   * HELPERS
   * ══════════════════════════════════════════════════════════════════════
   */

  /**
   * Verify refresh tokens
   */
  private verifyRefreshToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify(token, {
        secret: this.JWT_REFRESH_SECRET,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Generate access and refresh tokens
   */

  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return { accessToken, refreshToken };
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: User) {
    const { password, providerId, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}
