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

export enum SignUpRole {
  RIDER = 'RIDER',
  DRIVER = 'DRIVER',
}

export class SignUpDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,79}$/u, {
    message:
      'Full name can only contain letters, spaces, apostrophes, dots, and hyphens.',
  })
  fullName!: string;

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

  @ApiProperty({ enum: SignUpRole, enumName: 'SignUpRole' })
  @IsEnum(SignUpRole)
  role!: SignUpRole;

  // Format E.164 : +[code pays][numéro], 8–15 chiffres, ex. +22670123456
  @ApiPropertyOptional({ example: '+22670123456' })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'Phone number must be in E.164 format: +[country code][number], e.g. +22670123456',
  })
  phoneNumber?: string;
}
