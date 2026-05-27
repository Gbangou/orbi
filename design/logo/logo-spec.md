# Orbi — Charte logo

## Concept

Le logo Orbi est construit sur une metaphore simple et universelle : **l'orbite**.
Un vehicule (le point) tourne autour de la ville (l'anneau). L'anneau est complet,
le mouvement est perpetuel — c'est la promesse de la mobilite Orbi : toujours
disponible, toujours en mouvement, toujours fiable.

Le nom "orbi" vient du latin *orbis* (cercle, monde, orbite). Le logo en
illustre le sens geometriquement, sans artifice.

---

## Principes de conception

| Critere          | Application                                              |
|------------------|----------------------------------------------------------|
| Simplicite       | Deux formes seulement : anneau + point                   |
| Scalabilite      | Formes purement geometriques, lisibles de 16 px a 1 m   |
| Originalite      | L'orbite avec point de vehicule est unique dans le VTC   |
| Memorabilite     | Silhouette reconnaissable en noir et blanc               |
| Coherence        | Directement derive de la couleur systeme (`#2dd4bf`)     |
| Polyvalence      | Fond sombre, fond clair, monochrome, app icon            |
| Sens             | Vehicule en orbite = promesse de disponibilite continue  |

---

## Palette officielle

| Role             | Valeur hex | Usage                                    |
|------------------|------------|------------------------------------------|
| Orbi Teal        | `#2dd4bf`  | Anneau, point-vehicule, lueur            |
| Orbi Night       | `#07111d`  | Fond principal, logotype variante claire |
| Blanc signature  | `#f8fafc`  | Logotype sur fond sombre                 |

---

## Geometrie technique

### Marque (viewBox 60 × 60)

```
Anneau
  centre  : (30, 30)
  rayon   : 26
  trait   : 3 px

Point-vehicule  [a 45° du sommet = position 1h30]
  cx = 30 + 26 × sin(45°) = 48.38 ≈ 48.4
  cy = 30 − 26 × cos(45°) = 11.62 ≈ 11.6
  rayon = 5.5

Lueur (halo ambiant)
  meme centre que le point
  rayon = 10
  opacite = 0.18 (sur fond sombre uniquement)
```

### Logo horizontal (viewBox 220 × 60)

```
Marque  : x=0,  y=0,  largeur=60, hauteur=60
Espace  : 12 px entre marque et logotype
Logotype: x=72, y=41 (baseline)
  font-size    : 32 px
  font-weight  : 800
  letter-spacing: 3
  police       : system-ui / Helvetica Neue / Arial
```

### App icon (viewBox 1024 × 1024)

```
Fond    : #07111d, rx=228 (squircle approximatif iOS)
Anneau  : centre (512, 512), rayon 350, trait 42
Point-vehicule :
  cx = 512 + 350 × sin(45°) ≈ 760
  cy = 512 − 350 × cos(45°) ≈ 265
  rayon = 72
Lueur   : meme centre, rayon 115, opacite 0.20
```

---

## Composant React Native (`OrbiLogo`)

Situe dans `apps/rider-app/lib/orbi-logo.tsx`
et `apps/driver-app/lib/orbi-logo.tsx`.

```tsx
import { OrbiLogo } from '../lib/orbi-logo';

// Usage courant
<OrbiLogo size="lg" />

// Variante icone seule
<OrbiLogo size="md" showWordmark={false} />

// Orientation verticale
<OrbiLogo size="xl" orientation="vertical" />

// Teinte personnalisee (ex. amber pour le driver)
<OrbiLogo size="sm" tint="#f59e0b" />
```

### Tailles disponibles

| Size | Anneau | Point | Logotype | Usage type                    |
|------|--------|-------|----------|-------------------------------|
| xs   | 20 px  | 6 px  | 12 px    | Badges, chips, headers petits |
| sm   | 28 px  | 8 px  | 16 px    | Loading cards, nav            |
| md   | 38 px  | 10 px | 22 px    | Ecrans intermediaires         |
| lg   | 54 px  | 14 px | 30 px    | Splash, auth, onboarding      |
| xl   | 74 px  | 20 px | 42 px    | Marketing, hero screens       |

---

## Variantes et fichiers

| Fichier                     | Format | Usage                                    |
|-----------------------------|--------|------------------------------------------|
| `orbi-logo.svg`             | SVG    | Lockup horizontal, fond sombre (master)  |
| `orbi-icon.svg`             | SVG    | Marque seule, fond transparent           |
| `orbi-app-icon.svg`         | SVG    | Source pour generer icon.png (1024×1024) |
| `orbi-logo-light.svg`       | SVG    | Variante fond clair / impression         |
| `apps/*/lib/orbi-logo.tsx`  | TSX    | Composant React Native natif             |

---

## Generation des PNG Expo

Expo attend les fichiers suivants dans la racine de chaque app :

| Fichier             | Taille     | Source SVG            |
|---------------------|------------|-----------------------|
| `icon.png`          | 1024×1024  | `orbi-app-icon.svg`   |
| `adaptive-icon.png` | 1024×1024  | `orbi-app-icon.svg`   |
| `favicon.png`       | 32×32      | `orbi-icon.svg`       |
| `splash.png`        | 1284×2778  | composer avec logo xl |

Commande de conversion (require `sharp` en global) :
```bash
# Installer sharp-cli si necessaire
npm install -g sharp-cli

# Generer icon.png
sharp -i design/logo/orbi-app-icon.svg -o apps/rider-app/icon.png resize 1024

# Generer favicon.png
sharp -i design/logo/orbi-icon.svg -o apps/rider-app/favicon.png resize 32
```

---

## Regles d'utilisation

### Ce qu'il faut faire
- Utiliser le fichier SVG source sans modification
- Respecter l'espace minimal autour de la marque (= diametre du point-vehicule)
- Privilegier le fond sombre `#07111d` pour la version couleur
- Utiliser `OrbiLogo` avec la prop `size` appropriee (ne pas redimensionner via CSS)

### Ce qu'il ne faut pas faire
- Ne pas changer les proportions entre anneau et point
- Ne pas deplacer le point-vehicule de sa position a 1h30
- Ne pas utiliser d'autres couleurs que celles de la palette officielle sans validation
- Ne pas ajouter d'effets (ombre portee, degrade, 3D) non prevus dans la charte
- Ne pas afficher le logotype seul sans la marque (l'inverse est permis)

---

## Taille minimale d'affichage

| Support   | Taille minimale marque | Taille minimale lockup |
|-----------|------------------------|------------------------|
| Ecran     | 16 px de hauteur       | 20 px de hauteur       |
| Impression| 6 mm de hauteur        | 8 mm de hauteur        |

En dessous de ces tailles, utiliser la marque seule (`showWordmark={false}`).
