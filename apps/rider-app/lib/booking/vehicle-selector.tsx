/**
 * VehicleSelector — Sélecteur de service Orbi (Moto / Voiture / Confort)
 *
 * Composant pur extrait de book.tsx pour respecter le SRP.
 * Affiche les options de service en scroll horizontal avec icônes 3D,
 * surge badge, prix et ETA.
 */
import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatXof, orbiTheme } from '@orbi/ui';
import type { RideOption, PromoValidationResponse } from '@orbi/api';
import { VehicleIllustration } from './vehicle-illustrations';

function VehicleAvatar({
  isSelected, tone, tier,
}: {
  category: RideOption['category'];
  isSelected: boolean;
  tone: 'teal' | 'sky' | 'amber';
  tier: RideOption['tier'];
}) {
  const accent = tone === 'teal' ? orbiTheme.colors.teal : tone === 'sky' ? orbiTheme.colors.sky : orbiTheme.colors.amber;
  return (
    <View style={[
      styles.vehicleAvatar,
      isSelected && { backgroundColor: accent + '0F', borderColor: accent, borderWidth: 1.5 },
      !isSelected && { borderColor: orbiTheme.colors.border },
    ]}>
      <View style={[styles.vehicleAura, { backgroundColor: accent + '18' }]} />
      <View style={styles.svgWrap}>
        <VehicleIllustration tier={tier} />
      </View>
    </View>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface VehicleSelectorProps {
  options: RideOption[];
  selectedOptionId: string;
  promoValidation: PromoValidationResponse | null;
  isRefreshing: boolean;
  onSelect: (optionId: string) => void;
}

export const VehicleSelector = memo(function VehicleSelector({
  options,
  selectedOptionId,
  promoValidation,
  isRefreshing,
  onSelect,
}: VehicleSelectorProps) {
  function buildRideOptionVisual(option: RideOption): { tone: 'teal' | 'sky' | 'amber' } {
    const isMoto = option.category === 'motorcycle';
    return { tone: isMoto ? 'teal' : option.tier === 'car-comfort' ? 'sky' : 'amber' };
  }

  if (isRefreshing && options.length === 0) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={orbiTheme.colors.teal} />
        <Text style={styles.loadingText}>Calcul des options…</Text>
      </View>
    );
  }

  if (options.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Choisir un service</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {options.map((option) => {
          const { tone } = buildRideOptionVisual(option);
          const isSelected = option.id === (selectedOptionId || options[0]?.id);
          const accentColor = tone === 'teal' ? orbiTheme.colors.teal : tone === 'sky' ? orbiTheme.colors.sky : orbiTheme.colors.amber;
          const discountRate = promoValidation
            ? Math.min(Math.max(promoValidation.discountBps, 0), 10000) / 10000
            : 0;
          const discountedFare = promoValidation
            ? Math.max(1, Math.round(option.fare * (1 - discountRate)))
            : option.fare;
          const title = option.category === 'motorcycle' ? 'Moto' : option.title;

          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={[styles.card, isSelected && { borderColor: accentColor, backgroundColor: accentColor + '0D' }]}
            >
              {option.surgeActive ? (
                <View style={styles.surgeBadge}>
                  <Text style={styles.surgeText}>{option.surgeLabel}</Text>
                </View>
              ) : null}
              <VehicleAvatar
                category={option.category}
                isSelected={isSelected}
                tone={tone}
                tier={option.tier}
              />
              <Text style={[styles.name, isSelected && { color: orbiTheme.colors.text }]}>{title}</Text>
              <View style={styles.etaRow}>
                <Text style={styles.eta}>{option.etaMinutes} min</Text>
                {option.marketplace?.nearbyDrivers != null && option.marketplace.nearbyDrivers > 0 ? (
                  <View style={[styles.driverCountBadge, { borderColor: accentColor + '60' }]}>
                    <Text style={[styles.driverCountText, { color: accentColor }]}>
                      {option.marketplace.nearbyDrivers}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.fare, isSelected && { color: accentColor }]}>
                {formatXof(discountedFare)}
              </Text>
              {option.marketplace?.etaConfidence === 'LOW' ? (
                <Text style={styles.lowConfidence}>Disponibilité limitée</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text, paddingHorizontal: 2 },
  scroll: { gap: 6, paddingHorizontal: 2 },
  card: {
    width: 104, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1.5,
    borderColor: orbiTheme.colors.border, padding: 7, alignItems: 'center', gap: 4,
    shadowColor: '#0B1220', shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 7,
  },
  surgeBadge: { alignSelf: 'center', backgroundColor: 'rgba(255,149,0,0.90)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  surgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  vehicleAvatar: {
    width: 82, height: 56, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: orbiTheme.colors.border, backgroundColor: '#F6F8FB', overflow: 'hidden',
  },
  name: { fontSize: 12, fontWeight: '800', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.textSoft, textAlign: 'center', minHeight: 18 },
  eta: { fontSize: 11, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  fare: { fontSize: 12, fontWeight: '800', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.textSoft, textAlign: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 20 },
  loadingText: { fontSize: 14, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular' },
  vehicleAura: { position: 'absolute', width: 70, height: 40, borderRadius: 22, top: 7 },
  svgWrap: { width: 84, height: 54, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  driverCountBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  driverCountText: {
    fontSize: 9,
    fontWeight: '700',
  },
  lowConfidence: {
    fontSize: 9,
    color: orbiTheme.colors.amber,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -4,
  },
});
