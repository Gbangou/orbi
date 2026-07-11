import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SignUpRole } from './sign-up.dto';

export class SignInDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Password must include uppercase, lowercase, number, and special character.',
  })
  password!: string;

  // Envoyé par les apps rider/driver pour empêcher un compte d'un rôle de se
  // connecter via l'app de l'autre rôle (identifiants valides, mauvais rôle).
  // Omis par l'admin-web, qui authentifie ADMIN/OPS/SUPPORT.
  @ApiPropertyOptional({ enum: SignUpRole, enumName: 'SignUpRole' })
  @IsOptional()
  @IsEnum(SignUpRole)
  expectedRole?: SignUpRole;
}
