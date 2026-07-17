import {
  OrbiApiError,
  resolveMobileAuthErrorMessage,
} from '@orbi/api';

describe('resolveMobileAuthErrorMessage', () => {
  it('turns duplicate signup into an actionable field message', () => {
    expect(
      resolveMobileAuthErrorMessage(
        new OrbiApiError(
          'An account already exists with this email address.',
          409,
        ),
        { mode: 'sign-up', appRoleLabel: 'passager' },
      ),
    ).toContain('Ce compte existe deja');
  });

  it('turns auth lockouts into admin-unlock guidance', () => {
    expect(
      resolveMobileAuthErrorMessage(
        new OrbiApiError(
          'Account temporarily locked. Try again in 120 seconds.',
          401,
        ),
        { mode: 'sign-in', appRoleLabel: 'chauffeur' },
      ),
    ).toContain("Demandez a l'admin de debloquer le compte");
  });

  it('keeps invalid credentials non-enumerating but role-aware', () => {
    expect(
      resolveMobileAuthErrorMessage(
        new OrbiApiError('Invalid email or password.', 401),
        { mode: 'sign-in', appRoleLabel: 'chauffeur' },
      ),
    ).toBe(
      "Identifiants incorrects pour l'app chauffeur. Verifiez le mot de passe et que vous utilisez la bonne application.",
    );
  });
});
