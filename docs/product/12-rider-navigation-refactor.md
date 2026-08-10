# Rider navigation refactor

Date: 2026-08-10

## Objectif

Rendre le parcours Rider simple, previsible et coherent avec l'etat metier reel,
sans considerer la navigation comme autorite metier.

## Navigateurs inventories

| Navigateur | Fichier | Role |
| --- | --- | --- |
| Root stack | `apps/rider-app/app/_layout.tsx` | Auth, restauration session, crash boundary, notifications, deep links, reprise trajet actif |
| Tabs Rider | `apps/rider-app/app/(tabs)/_layout.tsx` | Surfaces principales authentifiees: accueil, activite, trajets, compte/support |
| Modales post-trajet | `apps/rider-app/app/receipt.tsx`, `apps/rider-app/app/rating.tsx` | Recu et notation, accessibles avec `tripId` valide |
| Not found | `apps/rider-app/app/+not-found.tsx` | Retour vers le guard racine pour redecider selon auth et backend |

## Routes conservees

- `/` : splash visuel seulement, decision centralisee dans le root layout.
- `/auth` : non authentifie.
- `/home` : application principale sans trajet actif.
- `/book` : preparation de demande, interdite si le backend signale un flux actif.
- `/activity` : trajet ou demande active, historique court et support contexte.
- `/trips` : historique.
- `/account` : profil, parametres et support.
- `/receipt?tripId=...` : recu post-trajet.
- `/rating?tripId=...` : notation post-trajet.

Aucune route applicative n'a ete supprimee: aucune route morte confirmee n'a ete
detectee dans `apps/rider-app/app`. Les routes inconnues et deep links invalides
sont maintenant interceptees.

## Architecture d'etats

| Etat | Route cible | Regle |
| --- | --- | --- |
| Non authentifie | `/auth` | Toute route protegee est remplacee par `/auth` |
| Onboarding | `/auth` | Pas encore separe dans Rider; l'auth porte l'entree compte |
| Application principale | `/home`, `/book`, `/trips`, `/account` | Autorisee si backend ne signale pas de flux actif incompatible |
| Trajet actif ou demande active | `/activity` | L'etat backend gagne sur toute route locale stale |
| Modales | `/receipt`, `/rating` | `tripId` obligatoire et borne |
| Support | `/account` ou actions dans `/activity` | Accessible sans parametre sensible |

## Decisions techniques

- La decision pure vit dans `apps/rider-app/lib/rider-navigation.ts`.
- Le root layout appelle `restoreRiderSession()` pour valider la session, puis
  `fetchMyTrips()` pour recuperer l'etat backend.
- `resolveRiderBackendNavigationState()` derive seulement un resume de navigation:
  actif, termine, absent ou indisponible.
- `resolveRiderNavigationDecision()` decide `allow` ou `replace`.
- `index.tsx` ne redirige plus: il affiche seulement le splash.
- Les notifications passent par `resolveRiderNotificationTarget()` pour eviter
  les ids de trajet dangereux.
- Les parametres de navigation sont bornes; aucun token ou payload sensible ne
  doit transiter par l'URL.

## Securite du retour arriere

- `auth`, `index`, tabs, recu, rating et not-found desactivent le geste de retour
  dans le root stack.
- Les transitions sensibles utilisent `router.replace` quand l'ecran precedent
  ne doit pas rester dans l'historique.
- L'ecran de reservation garde `router.back()` pour annuler une edition locale,
  mais le guard renvoie vers `/activity` si le backend signale un flux actif.

## Deep links et crash

- Deep link inconnu authentifie: retour `/home`.
- Deep link inconnu non authentifie: retour `/auth`.
- Ecran introuvable: retour vers `/`, puis decision centralisee.
- Reprise apres crash: l'ErrorBoundary continue de reporter le pathname, et le
  prochain montage relit session + backend avant d'afficher une surface sensible.

## Cas couverts par les tests

- utilisateur non connecte;
- connecte sans trajet;
- trajet actif;
- trajet termine;
- session expiree;
- deep link invalide;
- etat backend different de l'etat local;
- notification avec `tripId` invalide.

## Validations executees

- `pnpm --filter @orbi/rider-app test -- rider-navigation.test.ts --runInBand`
- `pnpm --filter @orbi/rider-app lint`

Les validations workspace completes sont executees apres ce livrable.
