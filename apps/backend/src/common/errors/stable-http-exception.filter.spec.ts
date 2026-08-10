import { BadRequestException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildStableErrorBody } from './stable-http-exception.filter';

describe('stable HTTP error responses', () => {
  it('formats validation errors without raw values or stack traces', () => {
    const response = buildStableErrorBody(
      new BadRequestException({
        message: [
          'pickupAddress contains unsafe characters',
          'admin property should not exist',
        ],
      }),
      'req_dirty_001',
    );

    expect(response).toEqual({
      statusCode: 400,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Certaines informations envoyées sont invalides.',
        correlationId: 'req_dirty_001',
        details: {
          validationErrors: [
            'pickupAddress contains unsafe characters',
            'admin property should not exist',
          ],
        },
      },
    });
    expect(JSON.stringify(response)).not.toContain('stack');
  });

  it('maps Prisma unique violations to a stable non-technical conflict', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email'] },
      },
    );
    const response = buildStableErrorBody(prismaError, 'req_prisma_001');

    expect(response.statusCode).toBe(409);
    expect(response.error.code).toBe('RESOURCE_CONFLICT');
    expect(response.error.message).toBe('Cette ressource existe déjà.');
    expect(JSON.stringify(response)).not.toContain('P2002');
    expect(JSON.stringify(response)).not.toContain('email');
  });

  it('maps malformed JSON and oversized payloads without leaking parser internals', () => {
    const syntaxError = new SyntaxError('Unexpected token < in JSON') as SyntaxError & {
      body: string;
    };
    syntaxError.body = '<script>alert(1)</script>';

    const malformed = buildStableErrorBody(syntaxError, 'req_json_001');
    const tooLarge = buildStableErrorBody(
      { type: 'entity.too.large', status: 413, limit: 262144 },
      'req_body_001',
    );

    expect(malformed.error).toMatchObject({
      code: 'MALFORMED_JSON',
      message: 'Le format JSON envoyé est invalide.',
      correlationId: 'req_json_001',
    });
    expect(JSON.stringify(malformed)).not.toContain('<script>');
    expect(tooLarge.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Les données envoyées sont trop volumineuses.',
      correlationId: 'req_body_001',
    });
    expect(JSON.stringify(tooLarge)).not.toContain('262144');
  });

  it('keeps unexpected errors generic', () => {
    const response = buildStableErrorBody(
      new Error('DATABASE_URL leaked in stack'),
      'req_internal_001',
    );

    expect(response.statusCode).toBe(500);
    expect(response.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response)).not.toContain('DATABASE_URL');
  });

  it('preserves business HTTP status while using a stable code', () => {
    const response = buildStableErrorBody(
      new HttpException('Session expirée.', 401),
      'req_auth_001',
    );

    expect(response).toMatchObject({
      statusCode: 401,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Session expirée.',
        correlationId: 'req_auth_001',
      },
    });
  });
});
