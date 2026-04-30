import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function createGuard(requiredRoles?: string[]) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    };

    return {
      reflector,
      guard: new RolesGuard(reflector as unknown as Reflector),
    };
  }

  function createExecutionContext(request: Record<string, unknown>) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when no roles are required', () => {
    const { guard } = createGuard(undefined);

    expect(
      guard.canActivate(
        createExecutionContext({
          auth: {
            user: {
              role: 'RIDER',
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it('allows access when the authenticated role is permitted', () => {
    const { guard } = createGuard(['ADMIN', 'OPS']);

    expect(
      guard.canActivate(
        createExecutionContext({
          auth: {
            user: {
              role: 'OPS',
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it('rejects access when the authenticated role is missing or forbidden', () => {
    const { guard } = createGuard(['ADMIN']);

    expect(() =>
      guard.canActivate(
        createExecutionContext({
          auth: {
            user: {
              role: 'RIDER',
            },
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
