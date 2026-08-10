import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { AuthService } from './auth.service';
import { extractAuthRequestMetadata } from './auth.metadata';
import { CurrentAuth } from './current-auth.decorator';
import { SignInDto } from './dto/sign-in.dto';
import { SignOutDto } from './dto/sign-out.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SessionAuthGuard } from './session-auth.guard';
import type { RequestAuthContext } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-up')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  signUp(@Body() payload: SignUpDto, @Req() request: Request) {
    return this.authService.signUp(
      payload,
      extractAuthRequestMetadata(request),
    );
  }

  @Post('sign-in')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 8, windowMs: 60_000 })
  signIn(@Body() payload: SignInDto, @Req() request: Request) {
    return this.authService.signIn(
      payload,
      extractAuthRequestMetadata(request),
    );
  }

  @Post('send-phone-otp')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    limit: 3,
    windowMs: 60_000,
    scopes: ['ip', 'body', 'device'],
    bodyField: 'phoneNumber',
  })
  sendPhoneOtp(@Body() payload: SendPhoneOtpDto, @Req() request: Request) {
    return this.authService.sendPhoneOtp(
      payload,
      extractAuthRequestMetadata(request),
    );
  }

  @Post('verify-phone-otp')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    limit: 8,
    windowMs: 60_000,
    scopes: ['ip', 'body', 'device'],
    bodyField: 'phoneNumber',
  })
  verifyPhoneOtp(@Body() payload: VerifyPhoneOtpDto, @Req() request: Request) {
    return this.authService.verifyPhoneOtp(
      payload,
      extractAuthRequestMetadata(request),
    );
  }

  @Post('refresh')
  @Version('1')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000, scopes: ['ip', 'device'] })
  refresh(@Body() payload: RefreshSessionDto, @Req() request: Request) {
    return this.authService.refreshSession(
      payload,
      extractAuthRequestMetadata(request),
    );
  }

  @Get('me')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  me(@CurrentAuth() auth: RequestAuthContext) {
    return this.authService.me(auth);
  }

  @Get('sessions')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  sessions(@CurrentAuth() auth: RequestAuthContext) {
    return this.authService.listSessions(auth);
  }

  @Post('sign-out')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  signOut(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload?: SignOutDto,
  ) {
    return this.authService.signOut(auth, payload);
  }

  // RGPD — Portabilité des données (art. 20) : retourne toutes les données personnelles
  // de l'utilisateur dans un format structuré lisible par machine.
  @Get('data-export')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 3, windowMs: 60 * 60_000 })
  @Header('Content-Disposition', 'attachment; filename="orbi-data-export.json"')
  dataExport(@CurrentAuth() auth: RequestAuthContext) {
    return this.authService.dataExport(auth);
  }

  // RGPD — Droit à l'effacement : anonymise les PII et révoque toutes les sessions.
  // Méthode DELETE + confirmation explicite pour empêcher les suppressions accidentelles.
  @Delete('account')
  @Version('1')
  @HttpCode(200)
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 3, windowMs: 60_000 })
  deleteAccount(@CurrentAuth() auth: RequestAuthContext) {
    return this.authService.deleteAccount(auth);
  }

  @Post('support-tickets')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000, scope: 'user' })
  createSupportTicket(
    @CurrentAuth() auth: RequestAuthContext,
    @Body() payload: CreateSupportTicketDto,
  ) {
    return this.authService.createSupportTicket(auth, payload);
  }

  @Get('support-tickets')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60_000, scope: 'user' })
  getMySupportTickets(@CurrentAuth() auth: RequestAuthContext) {
    return this.authService.getMySupportTickets(auth);
  }

  @Post('validate-promo-code')
  @Version('1')
  @ApiBearerAuth('session-token')
  @UseGuards(SessionAuthGuard)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000, scope: 'user' })
  validatePromoCode(
    @Body() body: { code: string },
    @CurrentAuth() auth: RequestAuthContext,
  ) {
    return this.authService.validatePromoCode(body.code, auth);
  }
}
