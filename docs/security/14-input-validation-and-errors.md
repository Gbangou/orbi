# Input Validation And Error Contract

Date: 2026-08-10

## Observed Baseline

The backend already uses a global `ValidationPipe` in `apps/backend/src/main.ts` with:

| Control | Status |
| --- | --- |
| Unknown fields | Rejected with `forbidNonWhitelisted`. |
| Mass assignment | Reduced by DTO whitelisting; service code must still never trust route/body user IDs for ownership. |
| Unknown object values | Rejected with `forbidUnknownValues`. |
| Runtime type transformation | Enabled globally; DTOs still need explicit decorators. |
| Route identifiers | Most routes use `OpaqueIdPipe`; scheduled ride cancel now does too. |
| Pagination | `PageQueryDto` and `PaginationQueryDto` cap `pageSize` at 100. |
| File upload links | Driver document signed URL requests validate type, file name and MIME format before URLs are issued. |
| Stored document artifacts | `DocumentLinksService` validates extension, MIME, declared size, hash and upload source. |

## Corrections Applied

| Area | File | Correction |
| --- | --- | --- |
| Stable API errors | `apps/backend/src/common/errors/stable-http-exception.filter.ts` | Added a global exception filter returning stable `statusCode` plus `error.code`, `error.message`, `error.correlationId` and optional safe `error.details`. |
| Prisma errors | `apps/backend/src/common/errors/stable-http-exception.filter.ts` | Maps known Prisma errors to business errors without exposing Prisma codes, model names, SQL, stack traces or raw targets. |
| Malformed JSON and body size | `apps/backend/src/common/errors/stable-http-exception.filter.ts` | Adds stable responses for malformed JSON and oversized payloads. |
| Scheduled ride creation | `apps/backend/src/modules/scheduled-rides/dto/create-scheduled-ride.dto.ts` | Replaced compile-time-only input typing with runtime DTO validation for text, coordinates, dates, vehicle type, payment method, city, notes and promo code. |
| Scheduled ride cancel | `apps/backend/src/modules/scheduled-rides/dto/create-scheduled-ride.dto.ts` and controller | Added bounded cancellation reason DTO and `OpaqueIdPipe` for `scheduledRideId`. |
| Dirty-data tests | `apps/backend/src/common/dirty-input-validation.spec.ts` | Added scheduled ride tests covering HTML/script, SQL-like strings, nulls, extreme coordinates, impossible date format, forbidden status/body fields and long strings. |
| Error-contract tests | `apps/backend/src/common/errors/stable-http-exception.filter.spec.ts` | Added tests proving validation, Prisma, malformed JSON, oversized payload and unexpected errors do not leak stack traces or raw internals. |

## Stable Error Format

All API errors should use:

```json
{
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Certaines informations envoyées sont invalides.",
    "correlationId": "req_abc123",
    "details": {
      "validationErrors": ["field must be a safe value"]
    }
  }
}
```

Rules:

| Field | Rule |
| --- | --- |
| `error.code` | Stable business code for client logic and translation. |
| `error.message` | Localizable user-facing message; no raw backend/Prisma/parser text. |
| `error.correlationId` | Uses `x-correlation-id` or `x-request-id` when safe, otherwise generated. Also returned as response header. |
| `error.details` | Optional and minimal. Validation details may include field-level constraint messages, never submitted raw values. |

## Error Code Mapping

| Source | HTTP | Business code |
| --- | --- | --- |
| DTO validation array | 400 | `VALIDATION_FAILED` |
| Generic bad request | 400 | `BAD_REQUEST` |
| Malformed JSON | 400 | `MALFORMED_JSON` |
| Unauthorized | 401 | `UNAUTHORIZED` |
| Forbidden | 403 | `FORBIDDEN` |
| Not found | 404 | `NOT_FOUND` |
| Conflict | 409 | `RESOURCE_CONFLICT` |
| Payload too large | 413 | `PAYLOAD_TOO_LARGE` |
| Rate limit | 429 | `RATE_LIMITED` |
| Service unavailable | 503 | `SERVICE_UNAVAILABLE` |
| Prisma `P2002` | 409 | `RESOURCE_CONFLICT` |
| Prisma `P2025` | 404 | `RESOURCE_NOT_FOUND` |
| Prisma `P2003` | 409 | `RESOURCE_CONSTRAINT_VIOLATION` |
| Other Prisma error | 500 | `DATABASE_REQUEST_FAILED` |
| Unexpected error | 500 | `INTERNAL_ERROR` |

## Input Validation Matrix

| Risk | Current control |
| --- | --- |
| DTO incomplets | New scheduled ride DTO added; continue replacing type-only bodies with classes. |
| Champs inconnus | Global whitelist/forbid policy rejects them. |
| Mass assignment | DTOs reject unknown fields; services must derive user/profile IDs from auth context. |
| Chaînes trop longues | DTOs cap names, addresses, notes, tokens, references, file names and webhooks. |
| Coordonnées invalides | DTOs use latitude/longitude bounds or explicit numeric min/max. |
| Nombres extrêmes | DTOs cap amounts, distances, durations, pagination and evidence retention. |
| Dates invalides | DTOs require ISO/UTC formats where relevant; scheduled ride service also parses real calendar dates strictly. |
| Statuts interdits | DTO enums or `IsIn` restrict status transitions and filters. |
| Fichiers falsifiés | Upload intent validates document type, leaf file name and MIME format. Artifact validation checks MIME/extension/size/hash. |
| Types MIME | Only PDF/JPEG/PNG accepted for driver documents; selfie excludes PDF. |
| Taille | Document policy caps 5 MB for documents and 3 MB for selfies; body limit comes from `http.requestBodyLimit`. |
| Noms | File names reject path separators/control characters; storage keys are server-generated for upload links. |
| Données imbriquées | Nested DTOs use `ValidateNested`, `Type`, array caps and whitelist. |
| Pagination | Page and page size are integer-bounded; max page size 100. |
| Tri/filtres | Current admin filters use enums/bounded search strings. Avoid accepting raw field names for sort. |
| Injections | DTOs reject unsafe markup in structured fields. Free text is bounded and must be rendered inert by clients/admin. |
| XSS | Structured text rejects `<`, `>`, braces, brackets, backslashes and control characters where user-visible. |
| Erreurs Prisma exposées | Stable error filter hides Prisma code/message/target from API responses. |
| Stack traces | Stable error filter logs server-side and returns generic 500 responses. |

## Dirty-Data Test Coverage

Covered in automated tests:

| Dirty input | Coverage |
| --- | --- |
| Emojis | Sign-up names and scheduled ride notes. |
| Accents/apostrophes | Accepted in realistic names and addresses. |
| HTML/scripts | Ride booking, saved places, trip notes, mobile reports, upload filenames, scheduled rides. |
| SQL-like strings | Scheduled ride payment/promo fields. |
| `null` | Scheduled ride required fields. |
| Very long strings | Names, addresses, notes, webhook IDs, refund reasons, scheduled ride text. |
| Impossible/invalid dates | Driver document artifacts and scheduled ride date format/service parsing. |
| Extreme coordinates | Ride booking, route position, SOS and scheduled ride DTOs. |
| Oversized files | Document policy tests cover max bytes. |
| Forged MIME | Driver upload link and artifact validation tests reject unsupported/mismatched MIME. |
| Malformed references | Opaque ID pipe, checkout intent, rider ID and idempotency key tests. |

## Remaining Rules

1. Every new `@Body()` and complex `@Query()` must use a class DTO, not a TypeScript type or inline object.
2. Every route `@Param()` carrying an opaque ID must use `OpaqueIdPipe`.
3. Never accept client-provided role, balance, fare, commission, ownership or status authority fields unless the service explicitly authorizes the transition.
4. Never return raw `error.message` for database, parser, provider or unexpected errors.
5. Logs may contain technical diagnostics with correlation IDs; responses must not.
6. Free-text fields may allow natural language, accents and apostrophes, but must stay bounded and be rendered as inert text.

