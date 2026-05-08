import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,96}$/;

@Injectable()
export class OpaqueIdPipe implements PipeTransform<string, string> {
  constructor(private readonly label = 'id') {}

  transform(value: string) {
    if (typeof value !== 'string' || !opaqueIdPattern.test(value)) {
      throw new BadRequestException(
        `${this.label} must be a safe opaque identifier.`,
      );
    }

    return value;
  }
}
