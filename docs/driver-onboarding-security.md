# Driver Onboarding Security

## Objectif

Mettre en place un onboarding chauffeur credible, securise et exploitable par les operations, sans accepter un profil insuffisamment documente dans le flux de courses.

## Principes

- separer inscription compte et activation chauffeur
- exiger une checklist minimale avant revue
- journaliser chaque soumission pour auditabilite
- forcer `verificationStatus=PENDING` a chaque nouvelle soumission sensible
- laisser les chauffeurs hors ligne tant que la revue n est pas terminee

## Checklist minimale actuelle

- numero de telephone
- permis de conduire
- piece d identite
- carte grise
- assurance
- selfie de verification
- vehicule actif configure

## Ce qui est implemente

- endpoint `GET /api/v1/drivers/onboarding`
- endpoint `PATCH /api/v1/drivers/onboarding`
- endpoint `GET /api/v1/admin/driver-onboarding-queue`
- endpoint `PATCH /api/v1/admin/driver-onboarding/:driverId/review`
- endpoint `PATCH /api/v1/drivers/onboarding/document-upload-links`
- endpoint `GET /api/v1/admin/driver-onboarding/:driverId/documents/:documentId/view-link`
- synchronisation des champs critiques:
  - `phoneNumber`
  - `licenseNumber`
  - `serviceRadiusKm`
  - vehicules actifs
- creation d un `AuditLog` `DRIVER_ONBOARDING_SUBMITTED`
- creation d evenements `DriverOnboardingReview` pour la soumission et les decisions ops
- fondation `DriverDocument` pour stocker les references de justificatifs et leur statut
- fondation HMAC pour liens signes d upload et de consultation
- verification explicite que la meme plaque ne peut pas etre reattribuee silencieusement a un autre chauffeur
- calcul d un resume de readiness et d une checklist exploitable
- file ops pour dossiers `PENDING` ou `REJECTED`
- decision ops explicite:
  - `UNDER_REVIEW`
  - `APPROVED`
  - `REJECTED`
  - `CHANGES_REQUESTED`

## Ce qui viendra ensuite

- URLs signees courtes durees pour upload et consultation securisee
- controle anti-fraude documentaire
- selfie match automatise
- expiration des documents et re-verification periodique
