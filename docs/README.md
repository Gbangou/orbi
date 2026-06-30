# Orbi Documentation Index

Date de reference: 8 mai 2026

Ce dossier garde la verite produit, architecture et operations de Orbi. Les
docs doivent rester utiles pour prendre une decision, executer un runbook ou
verifier un invariant. Quand le code change un flux critique, la doc qui porte
ce flux doit changer dans le meme travail.

## Sources de verite

| Besoin | Document |
| --- | --- |
| Mission, regles agent et invariants non negociables | `../AGENTS.md` |
| Etat d'avancement courant | `../DEVELOPMENT_STATUS.md` |
| Plan d'execution par phases | `../EXECUTION_PLAN.md` |
| Architecture systeme et standards | `../ORBI_ARCHITECTURE.md` |
| Politique securite | `../SECURITY.md` |
| Carte du monorepo et regles de dependances | `architecture/repository-map.md` |
| Invariants de donnees | `architecture/data-invariants.md` |
| Architecture runtime | `architecture/runtime-architecture.md` |
| Runbook deploiement | `deployment-runbook.md` |
| Onboarding chauffeur securise | `driver-onboarding-security.md` |
| Demo locale clic par clic | `demo-local-click-by-click.md` |
| Directive production | `production-readiness-directive.md` |
| Programme de tests securite et fiabilite | `security-test-program.md` |
| Roadmap world-class | `world-class-readiness-roadmap.md` |
| Audit professionnel app/APK du 30 juin 2026 | `professional-app-audit-2026-06-30.md` |

## Organisation

### `architecture/`

Decisions structurelles qui doivent survivre aux sprints: diagrammes, runtime,
invariants, limites entre apps et packages.

### Runbooks

Documents d'execution locale, terrain et production:

- `local-development.md`
- `demo-local-click-by-click.md`
- `local-e2e-field-session.md`
- `deployment-runbook.md`
- `guide-pas-a-pas-web-android.md`

### Produit et strategie

Documents qui cadrent les choix marche et operationnels:

- `competitive-benchmark.md`
- `professional-app-audit-2026-06-30.md`
- `payment-strategy.md`
- `pricing-burkina-strategy.md`
- `production-readiness-directive.md`
- `security-test-program.md`
- `world-class-readiness-roadmap.md`

## Regles de maintenance

1. Une doc racine explique le "quoi" et le "pourquoi"; une doc dans `docs/`
   explique le "comment executer" ou le detail domaine.
2. Les changements backend qui ajoutent un endpoint critique doivent mettre a
   jour `packages/api` et la doc domaine correspondante.
3. Les flux argent, onboarding, support, dispatch, realtime et admin doivent
   nommer leurs invariants, leur surface admin et leurs tests de verification.
4. Les dates de statut doivent etre concretes. Eviter les promesses vagues de
   production sans preuve terrain, runbook et verification reproductible.
5. Les diagrams Markdown restent textuels pour etre relus et modifies sans
   outil proprietaire.
