import {
  IsUrl,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsObject,
  IsString,
} from 'class-validator';

export class SendWebhookDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsOptional()
  method?: string; // Default to POST

  @IsObject()
  @IsOptional()
  headers?: Record<string, string>;

  @IsObject()
  @IsNotEmpty()
  payload: any;

  @IsIn([1, 5, 10])
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
