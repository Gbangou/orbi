import { PartialType } from '@nestjs/swagger';
import { CreateSavedPlaceDto } from './create-saved-place.dto';

export class UpdateSavedPlaceDto extends PartialType(CreateSavedPlaceDto) {}
