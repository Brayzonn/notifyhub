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
} from '@/auth/dto/auth.dto';
import { User, AuthProvider } from '@prisma/client';
import { AuthResponse, AuthTokens } from '@/auth/interfaces/auth.interface';
import { RedisService } from '@/redis/redis.service';
import { EmailService } from '@/email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private emailService: EmailService,
  ) {}

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
}
