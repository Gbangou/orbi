import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

const paymentWebhookProviders = ['FLUTTERWAVE', 'CINETPAY'] as const;
const paymentWebhookActions = [
  'persisted_and_reconciled',
  'persisted_idempotent_replay',
  'ignored_amount_mismatch',
  'ignored_conflicting_provider_reference',
  'ignored_unknown_reference',
  'ignored_missing_reference',
  'refund_processed',
  'refund_still_pending',
] as const;
const paymentWebhookKinds = ['payment', 'refund', 'ignored'] as const;

export class PaymentWebhookEventsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: paymentWebhookProviders })
  @IsOptional()
  @IsIn(paymentWebhookProviders)
  provider?: (typeof paymentWebhookProviders)[number];

  @ApiPropertyOptional({ enum: paymentWebhookActions })
  @IsOptional()
  @IsIn(paymentWebhookActions)
  action?: (typeof paymentWebhookActions)[number];

  @ApiPropertyOptional({ enum: paymentWebhookKinds })
  @IsOptional()
  @IsIn(paymentWebhookKinds)
  kind?: (typeof paymentWebhookKinds)[number];

  @ApiPropertyOptional({ example: 'mobilis_123_ride-request-1' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  transactionRef?: string;

  @ApiPropertyOptional({ example: 'fw_ref_123' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  providerReference?: string;
}
