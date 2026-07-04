# OSRM routing engine — Burkina Faso extract, prétraité au build.
#
# Toute la préparation coûteuse (extract/partition/customize) se fait ici,
# une seule fois au build Render, jamais au runtime. L'image finale ne fait
# que servir le graphe déjà prêt via osrm-routed (démarrage quasi instantané).
#
# Voir deploy/free-tier/GUIDE.md pour le déploiement complet.

# ── Étape 1 : téléchargement de l'extrait OSM (image minimale) ───────────────
FROM alpine:3.20 AS downloader
RUN apk add --no-cache curl
WORKDIR /data
RUN curl -fSL -o burkina-faso-latest.osm.pbf \
    https://download.geofabrik.de/africa/burkina-faso-latest.osm.pbf

# ── Étape 2 : prétraitement OSRM (extract → partition → customize) ──────────
FROM osrm/osrm-backend:latest AS builder
WORKDIR /data
COPY --from=downloader /data/burkina-faso-latest.osm.pbf .
RUN osrm-extract -p /opt/car.lua burkina-faso-latest.osm.pbf \
    && osrm-partition burkina-faso-latest.osrm \
    && osrm-customize burkina-faso-latest.osrm

# ── Étape 3 : image finale — sert uniquement le graphe déjà prétraité ───────
FROM osrm/osrm-backend:latest
WORKDIR /data
COPY --from=builder /data/burkina-faso-latest.osrm* ./
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--port", "5000", "/data/burkina-faso-latest.osrm"]
