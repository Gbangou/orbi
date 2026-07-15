'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAdminJson } from './admin-client-fetch';
import { subscribeToAdminRealtime } from './admin-realtime';

type OverviewData = {
  users: number;
  riders: number;
  drivers: number;
  vehicles: number;
  openRequests: number;
  activeTrips: number;
};

type Props = {
  initialData: OverviewData;
};

function formatLiveOverviewTime(value: Date) {
  if (!Number.isFinite(value.getTime())) {
    return 'heure a verifier';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function StatTile({
  label,
  value,
  color = '#00C9A7',
  fresh = false,
}: {
  label: string;
  value: number;
  color?: string;
  fresh?: boolean;
}) {
  return (
    <div
      style={{
        background: `linear-gradient(160deg, ${color}0d 0%, rgba(8,15,24,0.9) 100%)`,
        border: `1px solid ${color}28`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 16,
        padding: '14px 16px',
        display: 'grid',
        gap: 4,
        transition: 'box-shadow 0.3s ease',
        boxShadow: fresh ? `0 0 16px 0 ${color}33` : undefined,
      }}
    >
      <span style={{ fontSize: 10.5, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {label}
      </span>
      <strong
        style={{
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1,
          transition: 'color 0.3s',
          color: fresh ? color : '#F5F5F7',
        }}
      >
        {value.toLocaleString('fr-FR')}
      </strong>
    </div>
  );
}

export function LiveOverviewStats({ initialData }: Props) {
  const [data, setData] = useState<OverviewData>(initialData);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  const prevRef = useRef<OverviewData>(initialData);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  async function refresh() {
    try {
      const next = await fetchAdminJson<OverviewData>('/api/admin/overview');
      const prev = prevRef.current;
      const changed = new Set<string>();

      for (const key of Object.keys(next) as (keyof OverviewData)[]) {
        if (next[key] !== prev[key]) changed.add(key);
      }

      if (changed.size > 0) {
        setFreshKeys(changed);
        setTimeout(() => setFreshKeys(new Set()), 2500);
      }

      prevRef.current = next;
      setData(next);
      setLastUpdated(new Date());
    } catch {
      // silent — keep last known values
    }
  }

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'trip.created':           () => void refresh(),
      'trip.updated':           () => void refresh(),
      'ride-request.created':   () => void refresh(),
      'ride-request.cancelled': () => void refresh(),
    });

    stream.onerror = () => { /* silent reconnect */ };

    return () => stream.close();
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const timeStr = formatLiveOverviewTime(lastUpdated);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <p className="eyebrow" style={{ margin: 0 }}>Vue d&apos;ensemble plateforme</p>
        <span style={{ fontSize: 11, color: '#4e6a85', marginLeft: 'auto' }}>
          Mis à jour à {timeStr}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatTile label="Utilisateurs" value={data.users}        color="#38bdf8" fresh={freshKeys.has('users')}        />
        <StatTile label="Passagers"    value={data.riders}       color="#007AFF" fresh={freshKeys.has('riders')}       />
        <StatTile label="Chauffeurs"   value={data.drivers}      color="#00C9A7" fresh={freshKeys.has('drivers')}      />
        <StatTile label="Véhicules"    value={data.vehicles}     color="#a78bfa" fresh={freshKeys.has('vehicles')}     />
        <StatTile label="Demandes"     value={data.openRequests} color="#FF9500" fresh={freshKeys.has('openRequests')} />
        <StatTile label="Trajets actifs" value={data.activeTrips} color="#FF453A" fresh={freshKeys.has('activeTrips')} />
      </div>
    </div>
  );
}
