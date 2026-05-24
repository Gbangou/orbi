import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
// Les métadonnées de rôle déclaratives gardent les handlers lisibles pendant que
// le guard applique l'autorisation de façon cohérente sur tout l'arbre de modules.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
