# Orbi Design System

Date: 2026-08-10  
Portee initiale: `packages/ui`, apps mobiles Rider et Driver.  
Objectif: poser une base stable avant refonte progressive des ecrans, sans changement metier.

## Principes

1. Priorite terrain: Android entree/milieu de gamme, petits ecrans, reseau instable.
2. Une action principale par ecran.
3. Francais simple, phrases courtes, pas de jargon socket/API/backend.
4. FCFA sans decimales; montants lisibles et arrondis selon les helpers existants.
5. Les donnees techniques restent cachees par defaut: ids, references, coordonnees, enums.
6. Les primitives ne contiennent pas de texte metier code en dur; les apps fournissent les libelles.
7. Migration compatible: les anciens exports restent disponibles pendant la refonte.

## Fichiers Source

| Fichier | Role |
|---|---|
| `packages/ui/src/index.ts` | Tokens, themes, formatters, helpers partages |
| `packages/ui/src/mobile-primitives.tsx` | Primitives React Native et composants mobiles |
| `packages/ui/src/native.ts` | Exports mobiles |
| `packages/ui/src/theme-context.tsx` | Provider de theme |
| `packages/ui/src/offline-banner.tsx` | Etat hors connexion global |

## Tokens

`orbiDesignTokens` est la source a utiliser pour toute nouvelle primitive:

| Famille | Exemples | Regle |
|---|---|---|
| `color` | `ink`, `canvas`, `brand`, `warning`, `danger`, `info` | Une couleur = un sens; eviter les valeurs hex dans les ecrans |
| `type` | tailles `display/title/body/caption`, familles Inter/Raleway | Pas de taille basee sur viewport |
| `space` | `xs/sm/md/lg/xl/screen` | Espacements fixes, lisibles sur petit ecran |
| `radius` | `sm/md/lg/sheet/pill` | Cards a 8px par defaut, sheets a 20px |
| `touch` | `min 44`, `comfortable 48`, `large 56` | Toute action tappable doit faire au moins 44px |
| `shadow` | `card/sheet/button/float` | Ombres discretes pour performance Android |
| `opacity` | `disabled/pressed/muted` | Etats visuels coherents |

Les alias historiques de `orbiTheme` restent supportes: `teal`, `amber`, `sky`, `surface`, `border`, etc.

## Couleurs

Palette cible:

- Fond: blanc et gris tres clair pour performance et lisibilite.
- Texte: noir doux `#111111`, gris lisible pour secondaire.
- Brand: vert Orbi pour action positive, disponible, trajet actif.
- Warning: brun/ambre uniquement pour attente, reseau, verification.
- Danger: rouge uniquement pour securite, SOS, suppression, annulation destructive.
- Info: bleu uniquement pour information non critique.

Ne pas utiliser une couleur pour decorer sans signification.

## Typographie

| Usage | Token | Exemple |
|---|---|---|
| H1 ecran | `display` | Accueil, onboarding |
| Titre section | `section` | Paiement, Chauffeur |
| Corps | `body` | Instructions principales |
| Libelles | `label` | Champs, rows |
| Meta | `caption` | aide, horaires, details |
| Micro | `micro` | badges tres courts seulement |

Regle: dans les surfaces compactes, preferer `section` ou `label`; reserver `display` aux vrais headers.

## Primitives Disponibles

| Primitive | Usage |
|---|---|
| `OrbiScreen` | Racine d'ecran mobile avec audience rider/driver |
| `OrbiSurface` | Card ou panneau simple |
| `OrbiText` | Texte avec variants et tons |
| `OrbiButton` | Bouton primaire/secondaire/danger/ghost |
| `OrbiTextField` | Champ accessible avec label/helper/error |
| `OrbiBadge` | Badge court sans jargon |
| `OrbiListItem` | Ligne de liste dense mais lisible |
| `OrbiBottomSheet` | Sheet mobile avec handle |
| `OrbiModalCard` | Modale bottom-card |
| `OrbiStatusBanner` | Alerte/action contextualisee |
| `OrbiSkeleton` | Placeholder reseau lent |
| `OrbiLoader` | Loader simple, option label |
| `OrbiEmptyState` | Etat vide avec action optionnelle |
| `OrbiOfflineState` | Etat hors connexion dans une surface |
| `OrbiPrice` | Montant FCFA deja formate par l'appelant |
| `OrbiRouteSummary` | Depart/destination lisibles |
| `OrbiDriverSummary` | Chauffeur + vehicule + action |
| `OrbiPaymentSummary` | Montant, moyen, statut, reference optionnelle |
| `PersonBadge` | Identite courte existante |
| `TripStageTracker` | Progression trajet existante |

## Exemples

### CTA principal

```tsx
<OrbiButton
  label="Confirmer la course"
  helper="Paiement Mobile Money"
  tone="teal"
  onPress={handleConfirm}
/>
```

### Champ

```tsx
<OrbiTextField
  label="Destination"
  value={destination}
  onChangeText={setDestination}
  placeholder="Quartier ou lieu connu"
  helper="Exemple: Koulouba, Patte d'Oie"
  error={destinationError}
/>
```

### Prix FCFA

```tsx
<OrbiPrice
  label="Prix estime"
  amount={formatXof(1500)}
  helper="Avant confirmation chauffeur"
/>
```

### Trajet

```tsx
<OrbiRouteSummary
  pickupLabel="Maison"
  destinationLabel="Aeroport de Ouagadougou"
  meta="Environ 18 min"
/>
```

### Chauffeur

```tsx
<OrbiDriverSummary
  name="Issa Ouedraogo"
  vehicleLabel="Moto standard"
  rating={4.8}
  plate="11 AB 1234 BF"
  action={<OrbiButton label="Appeler" variant="secondary" tone="teal" />}
/>
```

### Etat vide

```tsx
<OrbiEmptyState
  title="Aucune course pour le moment"
  message="Vos trajets apparaitront ici apres votre premiere reservation."
  action={<OrbiButton label="Reserver" tone="teal" />}
/>
```

### Hors connexion

```tsx
<OrbiOfflineState
  title="Hors ligne"
  message="La derniere information fiable reste affichee."
/>
```

## Regles D'Usage

| Element | Regle |
|---|---|
| Boutons | 1 primaire visible par zone; destructive toujours confirmee |
| Champs | label visible, erreur simple, clavier adapte |
| Cards | pas de card dans card; utiliser `OrbiListItem` pour densite |
| Bottom sheets | hauteur responsive; CTA sticky si formulaire long |
| Badges | 1 ou 2 max dans une zone; pas de badge de synchronisation |
| Alertes | seulement si actionnable ou important |
| Loaders | skeleton pour contenu, loader bouton pour action |
| Empty states | une phrase + une action, pas de checklist technique |
| Offline | afficher derniere info fiable, pas "socket/realtime" |
| Prix | toujours FCFA/XOF, pas de decimales |
| Trajet | jamais afficher coordonnees brutes par defaut |
| Paiement | reference masquee sauf details/support |

## Migration Progressive

1. Remplacer les hex locaux par `theme.colors` ou `orbiDesignTokens`.
2. Remplacer les petits textes par `OrbiText`.
3. Remplacer les formulaires longs par `OrbiTextField`.
4. Remplacer les lignes route/paiement/chauffeur par les composants dedies.
5. Remplacer les sheets locales par `OrbiBottomSheet`.
6. Retirer les signaux techniques visibles: `jour`, ids, coordonnees, references non necessaires.

## Rapport Des Fichiers Modifies

| Fichier | Changement |
|---|---|
| `packages/ui/src/index.ts` | Ajout `orbiDesignTokens`, tokens touch/opacity, theme consolide |
| `packages/ui/src/theme-context.tsx` | `OrbiThemeProvider` accepte un theme optionnel |
| `packages/ui/src/mobile-primitives.tsx` | Ajout primitives et composants de migration UI |
| `packages/ui/src/native.ts` | Exports des nouvelles primitives |
| `packages/ui/src/offline-banner.tsx` | Utilise theme et texte offline simplifie |
| `docs/design/10-design-system.md` | Documentation et exemples |

## Verification

Baseline avant modification:

- `pnpm --filter @orbi/ui lint`: OK
- `pnpm --filter @orbi/ui build`: OK

Verifications apres modification executees:

- `pnpm --filter @orbi/ui lint`: OK
- `pnpm --filter @orbi/ui build`: OK
- `pnpm typecheck`: OK
- `pnpm test:mobile:smoke`: OK, Rider 19 suites / 152 tests, Driver 22 suites / 142 tests

Tests composants: le package `@orbi/ui` n'expose pas de script test dedie au moment de cette consolidation. Le smoke mobile Rider/Driver couvre les primitives deja consommees par les apps.
