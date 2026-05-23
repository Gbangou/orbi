import { Injectable } from '@nestjs/common';

@Injectable()
export class PushTokenService {
  private readonly tokens = new Map<string, string>();

  register(userId: string, token: string): void {
    this.tokens.set(userId, token.trim());
  }

  getToken(userId: string): string | null {
    return this.tokens.get(userId) ?? null;
  }

  revoke(userId: string): void {
    this.tokens.delete(userId);
  }
}
