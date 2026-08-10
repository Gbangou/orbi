# Orbi visible content and error guidelines

Date: 2026-08-10

## Objectif

Aucun utilisateur Orbi ne doit voir une erreur backend brute, un enum, une cle
interne, une reference technique ou une formulation de developpeur.

Le code technique reste utile, mais seulement dans les logs, les rapports
mobiles, les traces backend et les outils d'administration autorises.

## Architecture

- La langue initiale est le francais simple.
- Le package partage `@orbi/i18n` porte les helpers de contenu visibles.
- Les apps Rider et Driver utilisent `translateOrbiVisibleError` avant
  d'afficher une erreur utilisateur.
- Les fonctions de feedback conservent `code`, `surface`, `severity`,
  `retryPolicy` et `logCode` pour l'observabilite.
- Les messages affiches viennent de la couche contenu, jamais directement d'une
  reponse backend non validee.

## Fonction de traduction des erreurs

API principale:

```ts
translateOrbiVisibleError({
  code,
  message,
  status,
  surface,
  retryPolicy,
  fallbackMessage,
});
```

La fonction retourne:

- `message`: texte fonctionnel affichable.
- `action`: action UI attendue (`retry`, `reconnect`, `edit`,
  `contact-support`, `wait`, `none`).
- `actionLabel`: libelle visible de l'action.
- `logCode`: code technique a garder dans les logs.
- `severity`: niveau de presentation utilisateur.

## Conversions obligatoires

| Signal technique | Message utilisateur | Action |
| --- | --- | --- |
| `timeout`, `AbortError`, reseau coupe | Connexion lente. Reessayez dans un instant. | Reessayer |
| `unauthorized`, `401`, `403` | Session expiree. Reconnectez-vous pour continuer. | Se reconnecter |
| `payment failed` | Paiement non confirme. Verifiez votre telephone ou reessayez. | Reessayer |
| `driver unavailable` | Aucun chauffeur disponible pour le moment. Essayez une autre option ou reessayez. | Modifier |
| `location denied` | Localisation necessaire. Autorisez-la ou saisissez l'adresse manuellement. | Modifier |

## Contenu interdit en interface utilisateur

Ne jamais afficher:

- noms de services internes: API, backend, Prisma, SQL, webhook, socket;
- objets ou payloads JSON;
- enums ou statuts techniques non traduits;
- ids internes, UUID, references provider ou tokens;
- codes HTTP nus;
- stack traces, noms de variables, `undefined`, `null`;
- messages en anglais venant du backend dans une interface francaise;
- health checks ou diagnostics internes.

## Formats visibles

- Montants: `formatOrbiFcfa(1500)` -> `1 500 FCFA`.
- Dates: `formatOrbiDate(date)`.
- Heures: `formatOrbiTime(date)`.
- Date + heure: `formatOrbiDateTime(date)`.
- Pluriels: `formatOrbiPlural(count, { one, other })`.
- Statuts: `formatOrbiStatusLabel(status)`.

Les statuts metier doivent etre traduits avant affichage. Exemple:

- `REQUESTED` -> `Recherche en cours`
- `MATCHED` -> `Chauffeur trouve`
- `DRIVER_ARRIVING` -> `Chauffeur en route`
- `IN_PROGRESS` -> `En cours`
- `COMPLETED` -> `Termine`
- `MOBILE_MONEY` -> `Mobile money`

## Regles de redaction

- Une phrase courte par message.
- Dire ce que l'utilisateur peut faire maintenant.
- Eviter les explications techniques.
- Garder le francais simple, sans jargon.
- Pour les paiements, ne jamais promettre un succes avant confirmation serveur.
- Pour la securite, privilegier une consigne claire et une action support.
- Pour le reseau lent, rassurer sur la reprise et proposer de reessayer.

## Logs et support

Chaque erreur visible doit garder un lien technique hors interface:

- `code` pour la classification mobile;
- `logCode` pour le rapprochement avec les logs;
- `surface` pour savoir quel parcours est touche;
- `retryPolicy` pour guider la reprise;
- rapport mobile si `reportable === true`.

Les logs peuvent contenir le message technique nettoye, mais pas de secret, de
token, de mot de passe, d'email complet ou de telephone complet.

## Tests attendus

Les tests doivent verifier:

- aucun terme technique dans `feedback.message`;
- une action adaptee pour chaque erreur sensible;
- conservation de `logCode`;
- session expiree avec redirection auth;
- paiement non confirme sans exposition provider/webhook;
- chauffeur indisponible sans vocabulaire dispatch;
- localisation refusee avec option de correction.

## Migration

Pour tout nouvel ecran:

1. Importer les helpers depuis `@orbi/i18n`.
2. Formater dates, heures, montants et statuts via les helpers partages.
3. Traduire les erreurs via `translateOrbiVisibleError`.
4. Garder les codes techniques uniquement dans logs, reports et outils admin.
5. Ajouter un test si le flux peut echouer devant l'utilisateur.
