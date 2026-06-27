import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuthContext } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateCheckoutIntentDto } from './dto/create-checkout-intent.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout-intents')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard, RolesGuard, RateLimitGuard)
  @Roles(UserRole.RIDER, UserRole.ADMIN, UserRole.OPS)
  @RateLimit({ limit: 10, windowMs: 60_000, scope: 'user' })
  createCheckoutIntent(
    @Body() payload: CreateCheckoutIntentDto,
    @CurrentAuth() auth: RequestAuthContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.paymentsService.createCheckoutIntent(
      auth,
      payload,
      idempotencyKey,
    );
  }

  @Post('webhooks')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 120, windowMs: 60_000 })
  handleWebhook(
    @Headers('x-orbi-webhook-secret') secret: string | undefined,
    @Headers('flutterwave-signature') flutterwaveSignature: string | undefined,
    @Headers('verif-hash') flutterwaveVerificationHash: string | undefined,
    @Headers('x-token') cinetpayToken: string | undefined,
    @Req() request: Request & { rawBody?: string },
    @Body() payload: PaymentWebhookDto,
  ) {
    return this.paymentsService.handleWebhook(secret, payload, {
      rawBody: request.rawBody,
      flutterwaveSignature,
      flutterwaveVerificationHash,
      cinetpayToken,
    });
  }

  /**
   * Dedicated PawaPay webhook endpoint.
   *
   * PawaPay signs callbacks with HMAC-SHA256 on the raw request body
   * using the secret configured in PAWAPAY_WEBHOOK_SECRET.
   * This endpoint accepts traffic from PawaPay servers only — no session
   * auth required, but the signature is verified before any reconciliation.
   *
   * POST /api/v1/payments/webhooks/pawapay
   */
  @Post('webhooks/pawapay')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 300, windowMs: 60_000 })
  handlePawaPayWebhook(
    @Headers('x-pawapay-signature') signature: string | undefined,
    @Req() request: Request & { rawBody?: string },
    @Body() payload: PaymentWebhookDto,
  ) {
    return this.paymentsService.handlePawaPayWebhook(
      request.rawBody ?? JSON.stringify(payload),
      signature,
      payload,
    );
  }
}
