/**
 * Orbi — Cloudflare Worker utilitaire
 *
 * Deux rôles :
 *  1. Collecteur d'erreurs mobiles (POST /mobile-errors) — reçoit et consigne les
 *     rapports d'erreur du backend NestJS, retourne 202 pour acquittement.
 *  2. Keep-alive (cron toutes les 10 min) — ping le backend Render pour l'empêcher
 *     de subir des cold starts pendant les tests terrain.
 *
 * Déploiement : voir deploy/free-tier/GUIDE.md — Étape 3.
 */

const DEFAULT_BACKEND_HEALTH_URL =
  "https://orbi-field-api.onrender.com/api/v1/health/ready";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export default {
  /**
   * Gère les requêtes HTTP entrantes (erreurs mobiles du backend).
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/mobile-errors") {
      ctx.waitUntil(
        request
          .json()
          .then((body) => {
            const reports = Array.isArray(body?.reports) ? body.reports.length : 0;
            console.log(`[mobile-errors] accepted reports=${reports}`);
          })
          .catch((err) => {
            console.warn("[mobile-errors] malformed payload:", err.message);
          })
      );
      return jsonResponse({ status: "accepted" }, { status: 202 });
    }

    // Endpoint de santé du Worker lui-même
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ status: "ok", worker: "orbi-utils" });
    }

    return new Response("Not Found", { status: 404 });
  },

  /**
   * Cron déclenché toutes les 10 minutes pour garder Render éveillé.
   * Cloudflare Cron → GET /api/v1/health/ready sur le backend.
   */
  async scheduled(event, env, ctx) {
    const backendHealthUrl = env.BACKEND_HEALTH_URL ?? DEFAULT_BACKEND_HEALTH_URL;

    try {
      const response = await fetch(backendHealthUrl, {
        method: "GET",
        headers: { "User-Agent": "OrbiKeepAlive/1.0" },
        // Timeout de 10 secondes — si Render met plus longtemps à démarrer,
        // le prochain ping (10 min plus tard) lui donnera plus de temps.
        signal: AbortSignal.timeout(10_000),
      });
      console.log(
        `[keep-alive] Backend ping: ${response.status} ${response.statusText}`
      );
    } catch (err) {
      console.error("[keep-alive] Ping failed:", err.message);
    }
  },
};
