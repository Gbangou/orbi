/**
 * VehicleSelector — Sélecteur de service Orbi (Moto / Voiture / Confort)
 *
 * Composant pur extrait de book.tsx pour respecter le SRP.
 * Affiche les options de service en scroll horizontal avec icônes 3D,
 * surge badge, prix et ETA.
 */
import { memo, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { type OrbiTheme } from '@orbi/ui';
import { useOrbiTheme, VehicleIllustration } from '@orbi/ui/native';
import type { RideOption, PromoValidationResponse } from '@orbi/api';
import {
  calculateRiderDiscountedFare,
  formatRiderMoneyAmount,
} from '../rider-display-format';

function VehicleAvatar({
  isSelected, tier,
}: {
  category: RideOption['category'];
  isSelected: boolean;
  tone: 'teal' | 'sky' | 'amber';
  tier: RideOption['tier'];
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = '#111111';
  return (
    <View style={[
      styles.vehicleAvatar,
      isSelected && { backgroundColor: '#FFFFFF', borderColor: accent, borderWidth: 1.5 },
      !isSelected && { borderColor: '#E8E8E8' },
    ]}>
      <View style={styles.svgWrap}>
        <VehicleIllustration tier={tier} width={54} height={38} />
      </View>
      {isSelected ? (
        <View style={styles.checkBadge}>
          <View style={styles.checkMarkShort} />
          <View style={styles.checkMarkLong} />
        </View>
      ) : null}
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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  function buildRideOptionVisual(option: RideOption): { tone: 'teal' | 'sky' | 'amber' } {
    const isMoto = option.category === 'motorcycle';
    return { tone: isMoto ? 'teal' : option.tier === 'car-comfort' ? 'sky' : 'amber' };
  }

  if (isRefreshing && options.length === 0) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color="#111111" />
        <Text style={styles.loadingText}>Calcul des options…</Text>
      </View>
    );
  }

  if (options.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Service</Text>
      <View style={styles.list}>
        {options.map((option) => {
          const { tone } = buildRideOptionVisual(option);
          const isSelected = option.id === (selectedOptionId || options[0]?.id);
          const discountedFare = calculateRiderDiscountedFare({
            fare: option.fare,
            discountBps: promoValidation?.discountBps,
          });
          const title = option.category === 'motorcycle' ? 'Moto' : option.title;

          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={[styles.card, isSelected && styles.cardSelected]}
            >
              <VehicleAvatar
                category={option.category}
                isSelected={isSelected}
                tone={tone}
                tier={option.tier}
              />
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>{title}</Text>
                <Text style={styles.eta} numberOfLines={1}>
                  {option.etaMinutes} min{option.surgeActive ? ' · forte demande' : ''}
                </Text>
              </View>
              <Text style={[styles.fare, isSelected && styles.fareSelected]} numberOfLines={1}>
                {formatRiderMoneyAmount(discountedFare)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const makeStyles = (_theme: OrbiTheme) => StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', fontFamily: 'Inter_700Bold', color: '#111111', paddingHorizontal: 2 },
  list: { gap: 6 },
  card: {
    minHeight: 68,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardSelected: {
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
  },
  vehicleAvatar: {
    width: 58,
    height: 42,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F7F7F7',
    overflow: 'hidden',
  },
  checkBadge: {
    position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: 6,
    backgroundColor: '#111111',
    borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  checkMarkShort: {
    position: 'absolute', width: 6, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF',
    left: 4, top: 9, transform: [{ rotate: '45deg' }],
  },
  checkMarkLong: {
    position: 'absolute', width: 10, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF',
    left: 7, top: 8, transform: [{ rotate: '-45deg' }],
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '800', fontFamily: 'Inter_700Bold', color: '#111111' },
  eta: { fontSize: 12, color: '#6B6B6B', fontFamily: 'Inter_400Regular' },
  fare: { fontSize: 13, fontWeight: '800', fontFamily: 'Inter_700Bold', color: '#111111', textAlign: 'right', maxWidth: 92 },
  fareSelected: { color: '#111111' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 20 },
  loadingText: { fontSize: 14, color: '#6B6B6B', fontFamily: 'Inter_400Regular' },
  svgWrap: { width: 54, height: 38, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
