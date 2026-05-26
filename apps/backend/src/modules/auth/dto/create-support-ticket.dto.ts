import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const TICKET_CATEGORIES = [
  'payment',
  'trip',
  'account',
  'driver',
  'safety',
  'other',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export class CreateSupportTicketDto {
  @ApiProperty({ minLength: 5, maxLength: 120 })
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  subject!: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ enum: TICKET_CATEGORIES })
  @IsOptional()
  @IsIn(TICKET_CATEGORIES)
  category?: TicketCategory;
}
