import { SetMetadata } from '@nestjs/common';

export const PROFILE_ACCESS_KEY = 'profile-access';

export type ProfileAccessRequirement = 'rider' | 'driver';

export const RequireProfile = (profile: ProfileAccessRequirement) =>
  SetMetadata(PROFILE_ACCESS_KEY, profile);
