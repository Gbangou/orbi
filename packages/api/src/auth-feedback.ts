import { extractApiErrorMessage } from "./client";

type MobileAuthFeedbackOptions = {
  mode: "sign-in" | "sign-up";
  appRoleLabel: "passager" | "chauffeur";
};

function normalizeAuthMessage(error: unknown) {
  return extractApiErrorMessage(error, "").toLowerCase();
}

export function resolveMobileAuthErrorMessage(
  error: unknown,
  options: MobileAuthFeedbackOptions,
) {
  const message = normalizeAuthMessage(error);

  if (error instanceof TypeError) {
    return "Connexion impossible. Verifiez votre reseau mobile et reessayez.";
  }

  if (
    message.includes("aborted") ||
    message.includes("aborterror") ||
    message.includes("network request failed") ||
    message.includes("fetch failed") ||
    message.includes("load failed") ||
    message.includes("networkerror")
  ) {
    return "Connexion impossible. Verifiez votre reseau mobile et reessayez.";
  }

  if (message.includes("account temporarily locked")) {
    return "Login temporairement bloque apres plusieurs essais. Demandez a l'admin de debloquer le compte, puis reessayez.";
  }

  if (message.includes("already exists")) {
    return options.mode === "sign-up"
      ? "Ce compte existe deja. Passez sur Connexion, ou demandez a l'admin de verifier/debloquer le compte."
      : "Identifiants incorrects. Verifiez le mot de passe ou demandez a l'admin de verifier le compte.";
  }

  if (message.includes("invalid email or password")) {
    return `Identifiants incorrects pour l'app ${options.appRoleLabel}. Verifiez le mot de passe et que vous utilisez la bonne application.`;
  }

  return options.mode === "sign-up"
    ? "Creation du compte impossible pour le moment. Verifiez les informations et reessayez."
    : "Connexion refusee. Verifiez les informations et reessayez.";
}
