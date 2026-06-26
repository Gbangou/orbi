import { createOrbiApiClient, fetchSharedTripWithApi } from "@orbi/api";
import { orbiRuntimeConfig, resolveOrbiApiBaseUrl } from "@orbi/config";
import { notFound } from "next/navigation";

/**
 * Page publique de suivi de course — partageable par SMS, WhatsApp, etc.
 * Accessible sans authentification. Thème clair orienté grand public.
 *
 * URL: /shared/[shareToken]
 *
 * La famille/les proches du passager peuvent voir:
 * - La course en cours (statut, route)
 * - Le nom du chauffeur et du véhicule
 * - Le dernier événement horodaté
 */
export const revalidate = 30; // ISR: rafraîchi toutes les 30s côté serveur

function formatStatus(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    MATCHED: { label: 'Chauffeur confirmé — en route', color: '#007AFF' },
    DRIVER_APPROACHING: { label: 'Chauffeur en approche', color: '#FF9500' },
    DRIVER_AT_PICKUP: { label: 'Chauffeur arrivé au point de départ', color: '#FF9500' },
    IN_PROGRESS: { label: 'Trajet en cours', color: '#00C9A7' },
    COMPLETED: { label: 'Course terminée', color: '#00C9A7' },
    CANCELLED: { label: 'Course annulée', color: '#FF453A' },
  };
  return map[status] ?? { label: status, color: '#9E9E9E' };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-BF', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let trip: Awaited<ReturnType<typeof fetchSharedTripWithApi>>['sharedTrip'] | null = null;

  try {
    const client = createOrbiApiClient(
      resolveOrbiApiBaseUrl(process.env.ORBI_API_BASE_URL),
      { version: orbiRuntimeConfig.apiVersion },
    );
    const response = await fetchSharedTripWithApi(client, token);
    trip = response.sharedTrip;
  } catch {
    notFound();
  }

  if (!trip) notFound();

  const statusInfo = formatStatus(trip.status);
  const isActive = !['COMPLETED', 'CANCELLED'].includes(trip.status);

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Suivi de course — Orbi Burkina Faso</title>
        <meta name="description" content={`Suivi en direct: ${trip.pickupAddress} → ${trip.destinationAddress}`} />
        {isActive && <meta httpEquiv="refresh" content="30" />}
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #F7F7F7;
            color: #111111;
            min-height: 100vh;
          }
          .container { max-width: 480px; margin: 0 auto; padding: 24px 16px 48px; }
          .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
          .logo { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #111; }
          .logo span { color: #00C9A7; }
          .live-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #00C9A7; }
          .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #00C9A7; animation: pulse 1.8s ease-in-out infinite; }
          @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.3); } }
          .card { background: #FFFFFF; border-radius: 20px; padding: 20px; margin-bottom: 14px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
          .status-pill { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 14px; font-size: 14px; font-weight: 700; margin-bottom: 16px; }
          .route { display: flex; flex-direction: column; gap: 12px; }
          .route-row { display: flex; align-items: flex-start; gap: 12px; }
          .route-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
          .route-label { font-size: 11px; color: #9E9E9E; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          .route-addr { font-size: 15px; font-weight: 600; color: #111; line-height: 1.3; }
          .route-sep { width: 2px; height: 20px; background: #E8E8E8; margin-left: 5px; }
          .driver-card { display: flex; align-items: center; gap: 14px; }
          .driver-avatar { width: 52px; height: 52px; border-radius: 26px; background: #111; color: #fff; font-size: 18px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .driver-name { font-size: 16px; font-weight: 700; color: #111; }
          .driver-meta { font-size: 13px; color: #9E9E9E; margin-top: 2px; }
          .event { display: flex; justify-content: space-between; align-items: center; }
          .event-label { font-size: 14px; color: #545454; }
          .event-time { font-size: 13px; color: #9E9E9E; font-weight: 600; }
          .safety-note { font-size: 13px; color: #545454; line-height: 1.5; }
          .powered { text-align: center; font-size: 12px; color: #9E9E9E; margin-top: 24px; }
          .completed-banner { background: #00C9A7; color: #fff; border-radius: 16px; padding: 18px; text-align: center; margin-bottom: 14px; }
          .section-label { font-size: 11px; font-weight: 700; color: #9E9E9E; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; }
        `}</style>
      </head>
      <body>
        <div className="container">

          {/* Header */}
          <div className="header">
            <div className="logo">orb<span>i</span></div>
            {isActive && (
              <div className="live-badge">
                <div className="live-dot" />
                Suivi en direct
              </div>
            )}
          </div>

          {/* Completed banner */}
          {trip.status === 'COMPLETED' && (
            <div className="completed-banner">
              <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>✓ Course terminée</p>
              <p style={{ fontSize: 14, opacity: 0.85 }}>{trip.riderName} est arrivé à destination en sécurité.</p>
            </div>
          )}

          {/* Status */}
          <div className="card">
            <div className="status-pill" style={{ background: statusInfo.color + '18', color: statusInfo.color }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusInfo.color, display: 'inline-block' }} />
              {statusInfo.label}
            </div>

            <p className="section-label">Itinéraire</p>
            <div className="route">
              <div className="route-row">
                <div className="route-dot" style={{ background: '#00C9A7' }} />
                <div>
                  <div className="route-label">Départ</div>
                  <div className="route-addr">{trip.pickupAddress}</div>
                </div>
              </div>
              <div className="route-sep" style={{ marginLeft: 5 }} />
              <div className="route-row">
                <div className="route-dot" style={{ background: '#111' }} />
                <div>
                  <div className="route-label">Destination</div>
                  <div className="route-addr">{trip.destinationAddress}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Driver */}
          <div className="card">
            <p className="section-label">Chauffeur</p>
            <div className="driver-card">
              <div className="driver-avatar">
                {trip.driverName.split(' ').map((w: string) => w[0]?.toUpperCase()).join('').slice(0, 2)}
              </div>
              <div>
                <div className="driver-name">{trip.driverName}</div>
                <div className="driver-meta">{trip.vehicleLabel || 'Véhicule Orbi certifié'}</div>
              </div>
            </div>
          </div>

          {/* Last event */}
          {trip.lastEvent && (
            <div className="card">
              <p className="section-label">Dernier événement</p>
              <div className="event">
                <span className="event-label">{trip.lastEvent.label}</span>
                <span className="event-time">{formatTime(trip.lastEvent.createdAt)}</span>
              </div>
            </div>
          )}

          {/* Safety note */}
          <div className="card">
            <p className="section-label">Note de sécurité</p>
            <p className="safety-note">{trip.safetyNote || 'Ce trajet est suivi par les opérations Orbi. En cas d\'urgence, contactez le 17 (police) ou le 18 (pompiers).'}</p>
          </div>

          <p className="powered">
            Orbi — Transport sécurisé · Burkina Faso
            {trip.expiresAt ? ` · Lien valide jusqu'à ${formatTime(trip.expiresAt)}` : ''}
          </p>

        </div>
      </body>
    </html>
  );
}
