import { randomUUID } from 'crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

type ErrorDetails = Record<string, unknown>;

type StableErrorBody = {
  statusCode: number;
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: ErrorDetails;
  };
};

const safeCorrelationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveErrorCorrelationId(request?: Request) {
  const headerValue =
    firstHeaderValue(request?.headers['x-correlation-id']) ??
    firstHeaderValue(request?.headers['x-request-id']);
  const normalized = headerValue?.trim();

  return normalized && safeCorrelationIdPattern.test(normalized)
    ? normalized
    : randomUUID();
}

function truncate(value: string, maxLength = 180) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeValidationMessages(messages: unknown) {
  if (!Array.isArray(messages)) {
    return undefined;
  }

  const validationErrors = messages
    .filter((message): message is string => typeof message === 'string')
    .slice(0, 20)
    .map((message) => truncate(message.replace(/\s+/g, ' ').trim()));

  return validationErrors.length > 0 ? { validationErrors } : undefined;
}

function mapHttpException(exception: HttpException): {
  statusCode: number;
  code: string;
  message: string;
  details?: ErrorDetails;
} {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  const responseObject =
    response && typeof response === 'object' && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : {};
  const details = sanitizeValidationMessages(responseObject.message);

  if (statusCode === HttpStatus.BAD_REQUEST && details) {
    return {
      statusCode,
      code: 'VALIDATION_FAILED',
      message: 'Certaines informations envoyées sont invalides.',
      details,
    };
  }

  const defaultMessage =
    typeof responseObject.message === 'string'
      ? responseObject.message
      : exception.message;

  const codeByStatus: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'RESOURCE_CONFLICT',
    [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  };

  return {
    statusCode,
    code: codeByStatus[statusCode] ?? 'REQUEST_FAILED',
    message: defaultMessage || 'La requête n’a pas pu être traitée.',
  };
}

function mapPrismaException(
  exception: Prisma.PrismaClientKnownRequestError,
): {
  statusCode: number;
  code: string;
  message: string;
  details?: ErrorDetails;
} {
  if (exception.code === 'P2002') {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: 'RESOURCE_CONFLICT',
      message: 'Cette ressource existe déjà.',
      details: { reason: 'unique_constraint' },
    };
  }

  if (exception.code === 'P2025') {
    return {
      statusCode: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message: 'La ressource demandée est introuvable.',
    };
  }

  if (exception.code === 'P2003') {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: 'RESOURCE_CONSTRAINT_VIOLATION',
      message: 'Cette action est incompatible avec les données existantes.',
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'DATABASE_REQUEST_FAILED',
    message: 'La requête n’a pas pu être traitée.',
  };
}

function isPayloadTooLargeError(exception: unknown) {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    ((exception as { type?: unknown }).type === 'entity.too.large' ||
      (exception as { status?: unknown }).status ===
        HttpStatus.PAYLOAD_TOO_LARGE)
  );
}

function isMalformedJsonError(exception: unknown) {
  return (
    exception instanceof SyntaxError &&
    typeof (exception as { body?: unknown }).body === 'string'
  );
}

export function buildStableErrorBody(
  exception: unknown,
  correlationId: string,
): StableErrorBody {
  if (exception instanceof HttpException) {
    const mapped = mapHttpException(exception);
    return {
      statusCode: mapped.statusCode,
      error: {
        code: mapped.code,
        message: mapped.message,
        correlationId,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaException(exception);
    return {
      statusCode: mapped.statusCode,
      error: {
        code: mapped.code,
        message: mapped.message,
        correlationId,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
    };
  }

  if (isPayloadTooLargeError(exception)) {
    return {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Les données envoyées sont trop volumineuses.',
        correlationId,
      },
    };
  }

  if (isMalformedJsonError(exception)) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      error: {
        code: 'MALFORMED_JSON',
        message: 'Le format JSON envoyé est invalide.',
        correlationId,
      },
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'La requête n’a pas pu être traitée.',
      correlationId,
    },
  };
}

@Catch()
export class StableHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StableHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = resolveErrorCorrelationId(request);
    const body = buildStableErrorBody(exception, correlationId);

    response.setHeader('x-correlation-id', correlationId);

    if (body.statusCode >= 500) {
      this.logger.error(
        `Unhandled request error ${correlationId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }
}
