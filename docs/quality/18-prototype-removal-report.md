# Orbi - Rapport de nettoyage controle

Date: 2026-08-10  
Portee: nettoyage cible apres audits produit, securite, paiements, portefeuille et temps reel.  
Principe applique: aucune suppression massive, aucune migration destructive, aucun contournement TypeScript ou test.

## Resume

Le nettoyage a cible uniquement des usages confirmes dans le code:

- les erreurs WebView de carte malformees etaient ignorees via `catch {}` vides;
- un fallback Admin journalisait l'objet d'erreur brut;
- l'onboarding Driver contenait un `as any` sur une ville pourtant definie par le domaine;
- la validation de souscription WebSocket refusait des clients mobiles token-only alors que l'autorisation d'evenements reste faite par scope serveur.

Les fixtures de paiement, seeds et donnees de preview n'ont pas ete supprimes: leur usage reste documente comme developpement, tests, sandbox ou mode degrade.

## Supprime ou corrige

| ID | Type | Application | Fichier | Action | Raison | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Q18-001 | `catch` vide | Rider | `apps/rider-app/lib/home-map-view.tsx` | Remplace par parsing explicite avec retour controle | Eviter une erreur ignoree silencieusement dans la WebView carte sans exposer de log utilisateur | `pnpm typecheck`; test backend realtime cible |
| Q18-002 | `catch` vide | Rider | `apps/rider-app/lib/trip-map-view.tsx` | Remplace par validation de message et retour controle | Meme correction sur suivi trajet | `pnpm typecheck` |
| Q18-003 | `catch` vide | Rider | `apps/rider-app/lib/saved-places-map.tsx` | Ajoute garde `ReactNativeWebView` et retour controle | Eviter un bouton carte muet si le bridge n'est pas disponible | `pnpm typecheck` |
| Q18-004 | `catch` vide | Driver | `apps/driver-app/lib/approach-map-view.tsx` | Remplace par validation de message et retour controle | Eviter une erreur ignoree pendant approche passager | `pnpm typecheck` |
| Q18-005 | `catch` vide | Driver | `apps/driver-app/lib/driver-home-map-view.tsx` | Remplace par validation de message et retour controle | Eviter une erreur ignoree sur la carte d'accueil Driver | `pnpm typecheck` |
| Q18-006 | `catch` vide | Driver | `apps/driver-app/lib/trip-map-view.tsx` | Remplace par validation de message et retour controle | Eviter une erreur ignoree sur trajet actif Driver | `pnpm typecheck` |
| Q18-007 | `catch` vide | UI shared | `packages/ui/src/leaflet-map.ts` | Remplace par validation de message et retour controle | Nettoyage du snippet commun OSRM/Leaflet utilise par les cartes | `pnpm typecheck` |
| Q18-008 | `catch` vide | Admin | `apps/admin-web/app/live-ops-map.tsx` | Remplace par validation de message et retour controle | Eviter un iframe LiveOps silencieux sur message invalide | `pnpm typecheck` |
| Q18-009 | Log sensible potentiel | Admin | `apps/admin-web/app/page.tsx` | Retire l'objet `error` du `console.error` de fallback | Conserver le signal operationnel sans stack ni payload brut | `pnpm typecheck` |
| Q18-010 | `any` injustifie | Driver | `apps/driver-app/app/onboarding.tsx` | Type `selectedCity` avec `ApiPricingCity` et supprime `as any` | La ville appartient au contrat domaine partage | `pnpm typecheck` |
| Q18-011 | Incompatibilite prototype/protocole | Backend realtime | `apps/backend/src/core/realtime/realtime.types.ts` | Accepte les souscriptions mobiles token-only sans elargir les scopes d'evenements | Les clients mobiles existants n'envoient pas toujours le profil dans le payload de souscription; l'autorisation finale reste dans `canReceiveRealtimeEvent` | `pnpm --filter backend test -- realtime.security.spec.ts --runInBand` |
| Q18-012 | Test de garde | Backend realtime | `apps/backend/src/core/realtime/realtime.security.spec.ts` | Ajoute un test token-only qui verifie absence d'elargissement | Eviter une regression IDOR temps reel | `pnpm --filter backend test -- realtime.security.spec.ts --runInBand` |

## Conserve

| ID | Element | Fichier(s) | Raison |
| --- | --- | --- | --- |
| Q18-C01 | Fixtures paiement provider | `apps/backend/src/modules/payments/fixtures/*`, `payment-fixture-manifest.ts` | Utiles pour tests reproductibles de webhooks, doublons, evenements tardifs et sandbox. Ne doivent pas etre exposees comme donnees production. |
| Q18-C02 | Scripts `seed` et demo activity | `apps/backend/prisma/seed.ts`, `seed-demo-activity.ts`, `unseed-demo-activity.ts` | Outils de developpement explicites. Conservation conditionnee a ne pas executer sur base distante ou production. |
| Q18-C03 | Fallback Admin degrade | `apps/admin-web/app/page.tsx` | Mode de secours utile quand le backend est indisponible; les donnees sensibles restent masquees. A remplacer par un vrai etat vide operationnel avant pilote si besoin. |
| Q18-C04 | Donnees preview API | `packages/api/src/routes.ts` | Sert de contrat/fallback preview existant. Non supprime pour eviter de casser les ecrans admin et mobiles; a migrer derriere un flag explicite `development` lors d'une passe dediee. |
| Q18-C05 | `as any` WebView/Stack | Apps mobiles | Shims de typage React Native/Expo Router. Les retirer demanderait un refactor typage plus large et risque sans gain fonctionnel immediat. |
| Q18-C06 | `as any` de style `width: \`${pct}%\`` | `apps/*/lib/realtime-widgets.tsx` | Limitation de typage React Native pour valeurs percentuelles dynamiques. Conserve avec blast radius faible. |
| Q18-C07 | Textes contenant "console" | Admin web | Il s'agit de libelles utilisateur pour console d'administration, pas de logs techniques. |
| Q18-C08 | `PAWAPAY_ENVIRONMENT=sandbox` dans `.env.example` | `apps/backend/.env.example` | Valeur d'exemple sure par defaut: n'utilise pas d'argent reel. En production, les validations imposent secrets et mode explicite. |

## Deplace derriere un flag de developpement

Aucun element n'a ete deplace derriere un nouveau flag dans cette passe. Les candidats restent:

- donnees preview de `packages/api/src/routes.ts`;
- fallback Admin degrade;
- scripts demo activity.

Ces elements touchent des parcours visibles ou des outils operationnels; ils doivent etre traites dans une passe dediee avec confirmation produit et tests de non-regression.

## Non supprime

| Element | Pourquoi |
| --- | --- |
| Routes API de preview/sandbox | Certaines sont referencees par l'admin et les apps. Suppression sans cartographie d'usage casserait les ecrans existants. |
| Endpoints health | Necessaires a l'exploitation, readiness et monitoring; le probleme produit est l'exposition UI, pas l'existence backend. |
| Comptes seed | Necessaires au developpement local; aucun changement sans strategie de protection par environnement. |
| Styles dupliques de cartes | Des doublons restent dans les WebViews carte, mais une consolidation complete serait une refonte UI plus large que le nettoyage controle. |

## Verifications

Commandes d'inventaire executees:

- `rg "catch\s*\([^)]*\)\s*\{\s*\}" apps packages -n --glob '!**/*.spec.ts' --glob '!**/test/**'`
- `rg "console\." apps/rider-app apps/driver-app apps/admin-web apps/backend/src packages -n --glob '!**/*.spec.ts' --glob '!**/test/**'`
- `rg "\bas any\b|: any\b|Promise<any>|Record<string, any>" apps/rider-app apps/driver-app packages -n --glob '!**/*.spec.ts' --glob '!**/test/**'`
- `rg "mock|fake|demo|sample|fixture|seed|sandbox" apps packages -n --glob '!**/*.spec.ts' --glob '!**/test/**'`

Resultats avant validation finale:

- `catch {}` vide hors tests: aucun restant apres correction.
- `console.error` restant: uniquement signal admin degrade sans objet d'erreur brut.
- `any` restant: shims UI/WebView/Expo Router ou style React Native percentuel.

## Risques restants

- Les fixtures provider ne sont pas des captures sandbox reelles pour tous les fournisseurs; elles restent impropres comme preuve pilote.
- Les donnees de preview partagees doivent etre isolees plus clairement avant beta.
- Les cartes WebView contiennent encore du JavaScript inline; le nettoyage des `catch` ne remplace pas une vraie strategie de bundling/test des scripts embarques.
- La souscription WebSocket accepte un token sans profil local pour compatibilite mobile, mais l'authentification cryptographique du token a la connexion reste un chantier separe deja documente dans l'audit temps reel.

## Tests executes

- `pnpm --filter backend test -- realtime.security.spec.ts --runInBand` - OK, 39 tests passes.
- `pnpm typecheck` - OK, packages partages, admin-web, rider-app, driver-app et backend build/typecheck passes.

Note locale: PowerShell affiche un avertissement `fnm` au chargement du profil utilisateur, sans faire echouer les commandes.
