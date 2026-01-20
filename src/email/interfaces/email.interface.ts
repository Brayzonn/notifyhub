export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface OtpEmailData {
  email: string;
  otp: string;
  expiresInMinutes: number;
}

export interface WelcomeEmailData {
  email: string;
  name: string;
}

export interface ResetPasswordEmailData {
  email: string;
  resetToken: string;
  resetUrl: string;
}
