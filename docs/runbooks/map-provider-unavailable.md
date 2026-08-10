# Runbook - Fournisseur de cartes indisponible

## Symptomes

- cartes vides ou lentes;
- OSRM ne repond pas;
- itineraire indisponible.

## Diagnostic

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health
```

Si OSRM staging:

```bash
curl -fsS "$OSRM_BASE_URL/route/v1/driving/-1.5197,12.3686;-1.5,12.35"
```

## Actions

- Garder la reservation possible si backend peut estimer prudemment.
- Afficher messages fonctionnels, jamais stack ou statut provider brut.
- Desactiver routes avancees si necessaire par feature flag.
- Pour production, basculer vers fournisseur secondaire seulement s'il est deja contractualise.

## Validation

Les apps affichent position/destination et degradation claire; aucun prix final n'est calcule cote client.
