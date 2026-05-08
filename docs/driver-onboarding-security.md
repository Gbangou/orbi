# Driver Onboarding Security

## Objectif

Mettre en place un onboarding chauffeur credible, securise et exploitable par les operations, sans accepter un profil insuffisamment documente dans le flux de courses.

## Principes

- separer inscription compte et activation chauffeur
- exiger une checklist minimale avant revue
- journaliser chaque soumission pour auditabilite
- limiter les justificatifs a des formats et tailles attendus avant signature d upload
- rattacher chaque artefact documentaire au prefixe de stockage du profil chauffeur
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
- endpoint `GET /api/v1/admin/driver-onboarding/export.csv`
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
- liens HMAC courts pour upload et consultation
- retour des contraintes d upload au client chauffeur pour afficher formats et
  taille maximale avant soumission
- politique d upload par type de document:
  - piece, permis, carte grise et assurance: PDF, JPEG ou PNG, 5 MB maximum
  - selfie de verification: JPEG ou PNG, 3 MB maximum
- normalisation des noms de fichiers avant creation de cle objet
- rejet des types MIME risqués ou inattendus
- audit `DRIVER_DOCUMENT_UPLOAD_LINKS_CREATED` a chaque generation de liens
- rejet des artefacts dont la cle de stockage ne commence pas par le prefixe du profil chauffeur
- revalidation type, extension, MIME et contraintes d upload avant rattachement
  d un artefact au dossier chauffeur
- capture optionnelle des signaux d integrite declares au rattachement:
  `sizeBytes`, `sha256`, `uploadSource`, `capturedAt`
- declaration automatique de `uploadSource=driver-app` par le flux mobile
  chauffeur lors du rattachement
- rejet des tailles superieures a la politique du document et des empreintes
  SHA-256 mal formees
- exposition admin d un score d integrite documentaire par justificatif et par
  dossier chauffeur, pour distinguer une piece presente d une piece tracable
- recommandation ops par justificatif (`clear`, `review`, `resubmit`) derivee
  des preuves d integrite sans bloquer automatiquement les dossiers historiques
- guidance dossier (`approve`, `review`, `resubmit`) derivee des pieces
  requises, des statuts effectifs et des preuves d integrite, afin d eviter les
  approbations en un clic quand une redemande ou une revue humaine est plus sure
- priorisation admin de la file par guidance dossier pour traiter rapidement les
  profils prets, les dossiers a verifier et les redemandes documentaires
- recherche rapide admin par chauffeur, telephone, email, statut, type ou nom de
  justificatif pour retrouver un dossier sans sortir de la file de revue
- export CSV de la vue onboarding filtree/recherchee pour partager une
  liste courte de dossiers a rappeler, approuver ou recontroler, avec
  neutralisation des valeurs pouvant etre interpretees comme formules tableur
- export CSV backend reserve aux roles `ADMIN` et `OPS`, audite dans
  `AuditLog` avec filtre, recherche, limite et volume exporte
- verification explicite que la meme plaque ne peut pas etre reattribuee silencieusement a un autre chauffeur
- calcul d un resume de readiness et d une checklist exploitable
- file ops pour dossiers `PENDING` ou `REJECTED`
- decision ops explicite:
  - `UNDER_REVIEW`
  - `APPROVED`
  - `REJECTED`
  - `CHANGES_REQUESTED`

## Ce qui viendra ensuite

- backend objet reel compatible S3/GCS avec confirmation d existence post-upload
- comparaison du hash declare avec le hash calcule par le backend objet
- empreinte perceptuelle anti-duplication
- controle anti-fraude documentaire
- selfie match automatise
- expiration des documents et re-verification periodique
