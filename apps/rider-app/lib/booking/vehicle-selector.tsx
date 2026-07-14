/**
 * VehicleSelector — Sélecteur de service Orbi (Moto / Voiture / Confort)
 *
 * Composant pur extrait de book.tsx pour respecter le SRP.
 * Affiche les options de service en scroll horizontal avec icônes 3D,
 * surge badge, prix et ETA.
 */
import { memo, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type OrbiTheme } from '@orbi/ui';
import { useOrbiTheme, VehicleIllustration } from '@orbi/ui/native';
import type { RideOption, PromoValidationResponse } from '@orbi/api';
import {
  calculateRiderDiscountedFare,
  formatRiderMoneyAmount,
} from '../rider-display-format';

function VehicleAvatar({
  isSelected, tone, tier,
}: {
  category: RideOption['category'];
  isSelected: boolean;
  tone: 'teal' | 'sky' | 'amber';
  tier: RideOption['tier'];
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = tone === 'teal' ? theme.colors.teal : tone === 'sky' ? theme.colors.sky : theme.colors.amber;
  return (
    <View style={[
      styles.vehicleAvatar,
      isSelected && { backgroundColor: accent + '0F', borderColor: accent, borderWidth: 1.5 },
      !isSelected && { borderColor: theme.colors.border },
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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  function buildRideOptionVisual(option: RideOption): { tone: 'teal' | 'sky' | 'amber' } {
    const isMoto = option.category === 'motorcycle';
    return { tone: isMoto ? 'teal' : option.tier === 'car-comfort' ? 'sky' : 'amber' };
  }

  function buildSignalLabel(option: RideOption) {
    return option.marketplace?.signalLabel ?? 'Estime';
  }

  if (isRefreshing && options.length === 0) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={theme.colors.teal} />
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
          const accentColor = tone === 'teal' ? theme.colors.teal : tone === 'sky' ? theme.colors.sky : theme.colors.amber;
          const discountedFare = calculateRiderDiscountedFare({
            fare: option.fare,
            discountBps: promoValidation?.discountBps,
          });
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
              <Text style={[styles.name, isSelected && { color: theme.colors.text }]}>{title}</Text>
              <View style={styles.etaRow}>
                <Text style={styles.eta}>{option.etaMinutes} min</Text>
                <Text style={styles.signalText} numberOfLines={1} ellipsizeMode="tail">
                  {buildSignalLabel(option)}
                </Text>
                {option.marketplace?.nearbyDrivers != null && option.marketplace.nearbyDrivers > 0 ? (
                  <View style={[styles.driverCountBadge, { borderColor: accentColor + '60' }]}>
                    <Text style={[styles.driverCountText, { color: accentColor }]}>
                      {option.marketplace.nearbyDrivers}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.fare, isSelected && { color: accentColor }]}>
                {formatRiderMoneyAmount(discountedFare)}
              </Text>
              {option.marketplace?.etaConfidence === 'LOW' || option.marketplace?.etaSource === 'DEGRADED' ? (
                <Text style={styles.lowConfidence}>
                  {option.marketplace?.etaSource === 'DEGRADED'
                    ? 'ETA a confirmer'
                    : 'Disponibilite limitee'}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', fontFamily: 'Inter_700Bold', color: theme.colors.text, paddingHorizontal: 2 },
  scroll: { gap: 6, paddingHorizontal: 2 },
  card: {
    width: 112, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1.5,
    borderColor: theme.colors.border, padding: 7, alignItems: 'center', gap: 4,
    shadowColor: theme.shadows.card.shadowColor, shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 7,
  },
  surgeBadge: { alignSelf: 'center', backgroundColor: 'rgba(255,149,0,0.90)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  surgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  vehicleAvatar: {
    width: 82, height: 56, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundAlt, overflow: 'hidden',
  },
  name: { fontSize: 12, fontWeight: '800', fontFamily: 'Inter_700Bold', color: theme.colors.textSoft, textAlign: 'center', minHeight: 18 },
  eta: { fontSize: 11, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  fare: { fontSize: 12, fontWeight: '800', fontFamily: 'Inter_700Bold', color: theme.colors.textSoft, textAlign: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 20 },
  loadingText: { fontSize: 14, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular' },
  vehicleAura: { position: 'absolute', width: 70, height: 40, borderRadius: 22, top: 7 },
  svgWrap: { width: 84, height: 54, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%' },
  signalText: {
    maxWidth: 52,
    fontSize: 9,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
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
    color: theme.colors.amber,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -4,
  },
});
