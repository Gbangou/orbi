import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
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
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: SignUpRole, enumName: 'SignUpRole' })
  @IsEnum(SignUpRole)
  role!: SignUpRole;
}
