import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
// Declarative role metadata keeps controller handlers readable while letting
// the guard enforce authorization consistently across the module tree.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
