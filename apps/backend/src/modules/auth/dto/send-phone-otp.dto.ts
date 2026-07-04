import { IsEnum, IsString, Matches } from 'class-validator';
import { SignUpRole } from './sign-up.dto';

export class SendPhoneOtpDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be a valid E.164 number (e.g. +22670000000)',
  })
  phoneNumber!: string;

  // Restreint aux rôles auto-inscriptibles : ADMIN/SUPPORT/OPS ne doivent
  // jamais pouvoir être créés via un flux public non authentifié.
  @IsEnum(SignUpRole)
  role!: SignUpRole;
}
