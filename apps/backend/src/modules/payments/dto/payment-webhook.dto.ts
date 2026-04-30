import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentWebhookDto {
  [key: string]: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  event?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transactionRef?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cpm_site_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cpm_trans_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cpm_trans_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cpm_amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  cpm_currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  signature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  payment_method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cel_phone_num?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  cpm_phone_prefixe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  cpm_language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  cpm_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cpm_payment_config?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cpm_page_action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cpm_custom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cpm_designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cpm_error_message?: string;
}
