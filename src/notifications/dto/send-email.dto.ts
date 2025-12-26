import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsIn,
} from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsEmail()
  @IsOptional()
  from?: string;

  @IsIn([1, 5, 10])
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
