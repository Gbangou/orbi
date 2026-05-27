# Orbi — Comparatif des trois concepts logo

## Vue d'ensemble

Trois directions distinctes ont ete concues et implementees (SVG + React Native).
Choisissez-en une, puis exécutez les commandes d'integration ci-dessous.

---

## Concept A — "Orbite" *(actuellement integre)*

```
         ●   ← vehicule en orbite (1h30)
      ╭──╮
     │    │  ← anneau orbital
      ╰──╯
   orbi
```

**Marque :** Un anneau orbital complet + un point-vehicule exact a 45° du sommet.
Le vehicule tourne autour de la ville, perpetuellement en mouvement.

**Sens :** *orbis* (latin) = cercle, monde, orbite. La marque illustre le nom.

**Caractere :** Equilibre, circulaire, intemporel. Evoque les grandes marques tech
(Ferrari, BMW, Bosch). Lisible et reconnaissable a toutes les tailles.

**Fichiers :**
- `design/logo/orbi-logo.svg`
- `design/logo/orbi-icon.svg`
- `design/logo/orbi-app-icon.svg`
- `apps/*/lib/orbi-logo.tsx` → `OrbiLogo`

**Integration actuelle :** loader + ecran auth des deux apps.

---

## Concept B — "Signal"

```
         ╱
       ╱ ╱
     ╱ ╱ ╱  ← 3 arcs concentriques en quart de cercle
   ●           ← point-vehicule (origine du signal)

   orbi
```

**Marque :** Trois arcs concentriques en quart de cercle rayonnant depuis un
point-vehicule (bas-gauche) vers le haut-droit. Comme un signal radio ou une
couverture reseau, mais incline a 45° pour une dynamique asymetrique.

**Sens :** Le reseau Orbi irradie la ville. Chaque arc = une couche de service
(demande, dispatch, course). Le point = le vehicule qui porte tout le systeme.

**Caractere :** Dynamique, tech, moderne. Tres distinctif — aucun concurrent VTC
n'utilise cette forme. L'asymetrie cree du mouvement et de la direction.
Differe du symbole Wi-Fi par son orientation diagonale a 45° et son point d'origine
en bas a gauche (non en bas au centre).

**Lisibilite :** Excellente a grande taille. A surveiller en tres petite taille
(xs/sm) ou les arcs peuvent se rapprocher — preferer alors `showWordmark={false}`.

**Fichiers :**
- `design/logo/orbi-logo-signal.svg`
- `design/logo/orbi-icon-signal.svg`
- `design/logo/orbi-app-icon-signal.svg`
- `apps/*/lib/orbi-logo-signal.tsx` → `OrbiLogoSignal`

**Pour integrer** (remplacer le concept A) :
```tsx
// Dans app/_layout.tsx et app/auth.tsx de chaque app :
import { OrbiLogoSignal } from '../lib/orbi-logo-signal';

// Remplacer <OrbiLogo size="sm" /> par :
<OrbiLogoSignal size="sm" />

// Remplacer <OrbiLogo size="lg" /> par :
<OrbiLogoSignal size="lg" />
```

---

## Concept C — "Cap"

```
     ▌  ← capsule nord (indicateur de cap)
   ╭──╮
  │    │  ← anneau-cadran
   ╰──╯

   orbi
```

**Marque :** Un anneau fin (le cadran de boussole) avec une capsule verticale
pleine a 12h (l'aiguille nord). La capsule chevauche l'anneau de 1-2 px pour
les relier visuellement en un seul objet.

**Sens :** Boussole, cap magnetique, direction, destination. Orbi vous guide.
La capsule est le "nord" de la marque — sa promesse de direction.

**Caractere :** Autoritaire, precis, premium. La dualite plein/vide (capsule
pleine vs anneau en trait) cree une tension graphique forte. Ressemble aux logos
des marques de luxe ou de navigation (IWC, Omega, Garmin niveau design).
Plus statique que "Orbite" ou "Signal", ce qui renforce le sentiment de stabilite.

**Lisibilite :** Parfaite a toutes les tailles. La capsule reste visible meme
en 16px. Sur fond tres sombre, la lueur de la capsule (shadowColor) renforce
l'effet phare/beacon sur mobile.

**Fichiers :**
- `design/logo/orbi-logo-cap.svg`
- `design/logo/orbi-icon-cap.svg`
- `design/logo/orbi-app-icon-cap.svg`
- `apps/*/lib/orbi-logo-cap.tsx` → `OrbiLogoCap`

**Pour integrer** (remplacer le concept A) :
```tsx
// Dans app/_layout.tsx et app/auth.tsx de chaque app :
import { OrbiLogoCap } from '../lib/orbi-logo-cap';

// Remplacer <OrbiLogo size="sm" /> par :
<OrbiLogoCap size="sm" />

// Remplacer <OrbiLogo size="lg" /> par :
<OrbiLogoCap size="lg" />
```

---

## Tableau de decision

| Critere                    | A — Orbite     | B — Signal     | C — Cap        |
|----------------------------|----------------|----------------|----------------|
| Simplicite                 | ★★★★★         | ★★★★☆         | ★★★★★         |
| Originalite dans le VTC    | ★★★★☆         | ★★★★★         | ★★★★☆         |
| Lisibilite petite taille   | ★★★★★         | ★★★☆☆         | ★★★★★         |
| Dynamisme visuel           | ★★★★☆         | ★★★★★         | ★★★☆☆         |
| Caractere premium/luxe     | ★★★☆☆         | ★★★☆☆         | ★★★★★         |
| Icone app (1:1 carree)     | ★★★★★         | ★★★★☆         | ★★★★★         |
| Metaphore marche cible     | Mouvement      | Reseau/tech    | Direction      |
| Facilite de memorisation   | ★★★★★         | ★★★★★         | ★★★★★         |

---

## Recommandation

- **Si priorite : credibilite et longévite** → Concept A (Orbite) ou C (Cap)
- **Si priorite : differentiation immediate dans le VTC** → Concept B (Signal)
- **Si priorite : feel premium, marche qui monte en gamme** → Concept C (Cap)

Chaque concept partage la meme palette (#2dd4bf teal, #07111d night, #f8fafc blanc),
la meme typographie (system-ui bold 800, letter-spacing), et les memes
5 tailles calibrees (xs → xl).

---

## Apres le choix : generer les PNG Expo

```bash
# Installer sharp-cli
npm install -g sharp-cli

# icon.png 1024×1024 (remplacer "signal" par "cap" ou supprimer pour A)
sharp -i design/logo/orbi-app-icon-signal.svg -o apps/rider-app/icon.png resize 1024
sharp -i design/logo/orbi-app-icon-signal.svg -o apps/driver-app/icon.png resize 1024

# favicon.png 32×32
sharp -i design/logo/orbi-icon-signal.svg -o apps/rider-app/favicon.png resize 32
```

Puis ajouter dans chaque `app.json` :
```json
{
  "expo": {
    "icon": "./icon.png",
    "android": { "adaptiveIcon": { "foregroundImage": "./adaptive-icon.png" } },
    "web": { "favicon": "./favicon.png" }
  }
}
```
