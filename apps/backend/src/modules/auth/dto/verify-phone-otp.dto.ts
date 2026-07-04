import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SignUpRole } from './sign-up.dto';

export class VerifyPhoneOtpDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be a valid E.164 number (e.g. +22670000000)',
  })
  phoneNumber!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'code must contain only digits' })
  code!: string;

  // Restreint aux rôles auto-inscriptibles : ADMIN/SUPPORT/OPS ne doivent
  // jamais pouvoir être créés via un flux public non authentifié.
  @IsEnum(SignUpRole)
  role!: SignUpRole;

  // Requis uniquement à la première vérification (création de compte) :
  // sans compte existant pour ce numéro, il faut un nom pour créer l'utilisateur.
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,79}$/u, {
    message:
      'Full name can only contain letters, spaces, apostrophes, dots, and hyphens.',
  })
  fullName?: string;
}
