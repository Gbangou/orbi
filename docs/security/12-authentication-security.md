# Orbi Authentication Security

Date: 2026-08-10

## Etat corrige

- Les nouveaux logins creent un access token court et un refresh token rotatif.
- Les tokens restent opaques et seuls leurs hash SHA-256 sont stockes en base.
- Les refresh tokens sont a usage unique: chaque refresh cree une nouvelle session et revoque l'ancienne.
- La reutilisation d'un refresh token revoque ou expire declenche la revocation de toutes les sessions actives de l'utilisateur.
- Les anciennes sessions `sessionToken` restent compatibles jusqu'a leur expiration naturelle pour ne pas couper les utilisateurs existants.
- La deconnexion d'un appareil revoque l'access token et le refresh token de cette session.
- La deconnexion tous appareils est supportee via `POST /auth/sign-out` avec `allDevices: true`.
- Les comptes inactifs restent bloques au login, au refresh et dans le guard de session.
- Les connexions avec role inattendu restent rejetees avec un message generique anti-enumeration.
- Les OTP sont haches, expirent, sont a usage unique et limites en tentatives.
- L'envoi OTP est limite par IP, numero et appareil via le rate-limit HTTP et une limite active par numero.
- Les OTP ne sont plus journalises en clair lorsque la passerelle SMS n'est pas configuree.
- Les apps Rider et Driver stockent les tokens dans `expo-secure-store` sur mobile. Le web utilise `sessionStorage`, pas `localStorage`.
- L'admin web stocke access et refresh tokens dans des cookies `httpOnly`, `sameSite=strict`; `__Host-` et `secure` sont utilises en production.

## Migration

Migration additive:

- `refresh_token_hash`
- `refresh_token_expires_at`
- `refresh_revoked_at`
- `refresh_reused_at`

Aucune colonne existante n'est supprimee. Les sessions creees avant cette migration n'ont pas de refresh token et restent acceptees par le guard jusqu'a `expires_at`.

## Decisions

- Orbi garde des tokens opaques plutot que des JWT publics: la revocation serveur est immediate.
- `sessionToken` reste le nom public de l'access token pour compatibilite API/mobile.
- La duree courte d'access token s'applique aux nouvelles sessions. Les sessions historiques suivent leur expiration existante.
- La recuperation de compte reste limitee au flux OTP telephone existant. Aucun flux reset email n'a ete invente sans infrastructure produit/support.
- Les logs d'audit auth ne contiennent pas de token brut, refresh token, OTP ou mot de passe.

## Risques residuels

- Le temps reel mobile utilise encore un token en query string WebSocket. React Native ne fournit pas un support uniforme des headers WebSocket; il faut migrer vers un handshake ephemere ou un protocole d'auth websocket dedie avant production.
- Le rate-limit est local a l'instance applicative si l'implementation `RateLimitService` n'est pas branchee a un stockage partage. En production multi-instance, utiliser Redis ou equivalent.
- L'absence de passerelle SMS configuree empeche la livraison OTP reelle. Le code n'est plus loggue; un environnement sans SMS ne peut donc pas verifier un vrai utilisateur sans outil support dedie.

## Tests couverts

- OTP absent, expire ou reutilise.
- OTP mauvais et limite de tentatives.
- Limitation d'OTP actif par numero.
- Anti-enumeration email et role.
- Compte inactif.
- Refresh token valide avec rotation.
- Refresh token expire.
- Refresh token reutilise avec revocation globale.
- Session revoquee.
- Deconnexion d'une session.
- Deconnexion de tous les appareils.
- Exclusion du hash de mot de passe des reponses.

## Avant production

- Ajouter un handshake websocket ephemere sans token en URL.
- Brancher le rate-limit sur un stockage distribue.
- Ajouter un parcours support explicite de recuperation de compte.
- Ajouter une revue d'alerting sur `REFRESH_REUSE_DETECTED`.
