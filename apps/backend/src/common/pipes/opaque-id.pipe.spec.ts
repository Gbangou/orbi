import { BadRequestException } from '@nestjs/common';
import { OpaqueIdPipe } from './opaque-id.pipe';

describe('OpaqueIdPipe', () => {
  it('accepts cuid-like and locally seeded opaque identifiers', () => {
    const pipe = new OpaqueIdPipe('jobId');

    expect(pipe.transform('clv1234567890abcdef')).toBe('clv1234567890abcdef');
    expect(pipe.transform('job-dead-1')).toBe('job-dead-1');
  });

  it.each(['../driver-1', '..\\driver-1', '<script>', 'a'.repeat(120), ''])(
    'rejects unsafe route identifier %s',
    (value) => {
      const pipe = new OpaqueIdPipe('driverId');

      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});
