import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProfileAccessGuard } from './profile-access.guard';

describe('ProfileAccessGuard', () => {
  function createGuard(requirement?: 'rider' | 'driver') {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requirement),
    };

    return {
      reflector,
      guard: new ProfileAccessGuard(reflector as unknown as Reflector),
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

  it('allows access when no profile requirement is declared', () => {
    const { guard } = createGuard(undefined);

    expect(guard.canActivate(createExecutionContext({}))).toBe(true);
  });

  it('allows rider access when a rider profile is attached', () => {
    const { guard } = createGuard('rider');

    expect(
      guard.canActivate(
        createExecutionContext({
          auth: {
            user: {
              riderProfile: { id: 'rider-1' },
              driverProfile: null,
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it('rejects access when the required profile is missing', () => {
    const { guard } = createGuard('driver');

    expect(() =>
      guard.canActivate(
        createExecutionContext({
          auth: {
            user: {
              riderProfile: { id: 'rider-1' },
              driverProfile: null,
            },
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
