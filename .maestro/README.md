# Orbi — Tests E2E Maestro

Flux de test end-to-end pour les applications Rider et Driver.

## Prérequis

```bash
# Installer Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Vérifier l'installation
maestro --version
```

## Lancer les tests

```bash
# Test individuel
maestro test .maestro/01_rider_signup.yaml

# Suite complète rider
maestro test .maestro/01_rider_signup.yaml
maestro test .maestro/02_rider_book_trip.yaml
maestro test .maestro/05_rider_rate_and_receipt.yaml
maestro test .maestro/06_rider_trips_history.yaml

# Suite complète driver
maestro test .maestro/03_driver_accept_offer.yaml
maestro test .maestro/04_driver_complete_trip.yaml

# Tous les tests (ordre recommandé)
maestro test .maestro/
```

## Flux couverts

| Fichier | App | Flux |
|---------|-----|------|
| `01_rider_signup.yaml` | Rider | Inscription → écran d'accueil |
| `02_rider_book_trip.yaml` | Rider | Réservation d'une course avec recherche d'adresse |
| `03_driver_accept_offer.yaml` | Driver | Accepter une offre → carte d'approche |
| `04_driver_complete_trip.yaml` | Driver | Pickup code → IN_PROGRESS → COMPLETED |
| `05_rider_rate_and_receipt.yaml` | Rider | Note chauffeur + reçu de course |
| `06_rider_trips_history.yaml` | Rider | Onglet Trajets — stats + pull-to-refresh |

## Notes

- Les `optional: true` permettent aux assertions de ne pas bloquer si l'élément n'est pas encore visible
  (utile pour les transitions animées ou les chargements réseau)
- Les tests supposent un backend local sur `http://localhost:3000`
- Pour CI/CD, utiliser `maestro cloud` avec les identifiants Maestro Cloud
