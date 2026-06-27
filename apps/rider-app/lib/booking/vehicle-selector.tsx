/**
 * VehicleSelector — Sélecteur de service Orbi (Moto / Voiture / Confort)
 *
 * Composant pur extrait de book.tsx pour respecter le SRP.
 * Affiche les options de service en scroll horizontal avec icônes 3D,
 * surge badge, prix et ETA.
 */
import { memo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatXof, orbiTheme } from '@orbi/ui';
import type { RideOption, PromoValidationResponse } from '@orbi/api';

// ── 3D Vehicle icons (kept co-located with selector) ─────────────────────────

function CarTopView({ accent, isPremium }: { accent: string; isPremium: boolean }) {
  const a18 = accent + '2e';
  const a40 = accent + '66';
  const a60 = accent + '99';
  return (
    <View style={styles.vIcon}>
      <View style={[styles.vWheelFL, styles.vWheel]} />
      <View style={[styles.vWheelFR, styles.vWheel]} />
      <View style={[styles.vWheelRL, styles.vWheel]} />
      <View style={[styles.vWheelRR, styles.vWheel]} />
      <View style={[styles.vCarBody, { backgroundColor: a18, borderColor: accent }]} />
      <View style={styles.vWindshield} />
      <View style={styles.vRearWindow} />
      <View style={[styles.vRoof, { backgroundColor: a40 }]} />
      <View style={[styles.vMirrorL, { backgroundColor: a60, borderColor: accent }]} />
      <View style={[styles.vMirrorR, { backgroundColor: a60, borderColor: accent }]} />
      <View style={styles.vHeadL} />
      <View style={styles.vHeadR} />
      <View style={styles.vTailL} />
      <View style={styles.vTailR} />
      {isPremium ? <View style={[styles.vPremiumBadge, { backgroundColor: accent }]} /> : null}
    </View>
  );
}

function MotoTopView({ accent }: { accent: string }) {
  const a18 = accent + '2e';
  const a50 = accent + '80';
  const a30 = accent + '4d';
  return (
    <View style={styles.vIcon}>
      <View style={[styles.vMotoWheelF, { borderColor: accent, backgroundColor: a18 }]} />
      <View style={[styles.vMotoWheelR, { borderColor: accent, backgroundColor: a18 }]} />
      <View style={[styles.vMotoBody, { borderColor: accent, backgroundColor: a30 }]} />
      <View style={[styles.vMotoHandlebar, { backgroundColor: a50, borderColor: accent }]} />
      <View style={[styles.vMotoSeat, { backgroundColor: accent + 'aa' }]} />
      <View style={[styles.vMotoEngine, { borderColor: accent }]} />
    </View>
  );
}

function VehicleAvatar({
  category, isSelected, tone, tier,
}: {
  category: RideOption['category'];
  isSelected: boolean;
  tone: 'teal' | 'sky' | 'amber';
  tier: RideOption['tier'];
}) {
  const isMoto = category === 'motorcycle';
  const accent = tone === 'teal' ? orbiTheme.colors.teal : tone === 'sky' ? orbiTheme.colors.sky : orbiTheme.colors.amber;
  const isPremium = tier === 'moto-plus' || tier === 'car-comfort' || tier === 'car-xl';
  return (
    <View style={[styles.vehicleAvatar, isSelected && { backgroundColor: accent + '18', borderColor: accent, borderWidth: 1.5 }, !isSelected && { borderColor: orbiTheme.colors.border }]}>
      {isMoto ? <MotoTopView accent={accent} /> : <CarTopView accent={accent} isPremium={isPremium} />}
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
          const discountedFare = promoValidation
            ? Math.round(option.fare * (1 - promoValidation.discountBps / 10000))
            : option.fare;

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
              <Text style={[styles.name, isSelected && { color: orbiTheme.colors.text }]}>{option.title}</Text>
              <Text style={styles.eta}>{option.etaMinutes} min</Text>
              <Text style={[styles.fare, isSelected && { color: accentColor }]}>
                {formatXof(discountedFare)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text, paddingHorizontal: 2 },
  scroll: { gap: 10, paddingHorizontal: 2 },
  card: {
    width: 112, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1.5,
    borderColor: orbiTheme.colors.border, padding: 12, alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  surgeBadge: { alignSelf: 'center', backgroundColor: 'rgba(255,149,0,0.90)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  surgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  vehicleAvatar: { width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: orbiTheme.colors.border, backgroundColor: orbiTheme.colors.backgroundAlt },
  name: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.textSoft, textAlign: 'center' },
  eta: { fontSize: 11, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  fare: { fontSize: 14, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.textSoft, textAlign: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 20 },
  loadingText: { fontSize: 14, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular' },
  // Vehicle 3D styles
  vIcon: { width: 56, height: 56, position: 'relative' },
  vWheel: { position: 'absolute', width: 7, height: 12, borderRadius: 2, backgroundColor: '#333' },
  vWheelFL: { top: 4, left: 2 }, vWheelFR: { top: 4, right: 2 }, vWheelRL: { bottom: 4, left: 2 }, vWheelRR: { bottom: 4, right: 2 },
  vCarBody: { position: 'absolute', top: 6, bottom: 6, left: 8, right: 8, borderRadius: 8, borderWidth: 1.5 },
  vWindshield: { position: 'absolute', top: 10, left: 14, right: 14, height: 8, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 4 },
  vRearWindow: { position: 'absolute', bottom: 10, left: 14, right: 14, height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3 },
  vRoof: { position: 'absolute', top: 18, left: 16, right: 16, height: 20, borderRadius: 5 },
  vMirrorL: { position: 'absolute', top: 20, left: 5, width: 4, height: 6, borderRadius: 2, borderWidth: 1 },
  vMirrorR: { position: 'absolute', top: 20, right: 5, width: 4, height: 6, borderRadius: 2, borderWidth: 1 },
  vHeadL: { position: 'absolute', top: 6, left: 10, width: 5, height: 3, backgroundColor: '#fffde7', borderRadius: 2 },
  vHeadR: { position: 'absolute', top: 6, right: 10, width: 5, height: 3, backgroundColor: '#fffde7', borderRadius: 2 },
  vTailL: { position: 'absolute', bottom: 6, left: 10, width: 5, height: 3, backgroundColor: '#ff3b30', borderRadius: 2 },
  vTailR: { position: 'absolute', bottom: 6, right: 10, width: 5, height: 3, backgroundColor: '#ff3b30', borderRadius: 2 },
  vPremiumBadge: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
  vMotoWheelF: { position: 'absolute', top: 2, left: 10, right: 10, height: 12, borderRadius: 6, borderWidth: 1.5 },
  vMotoWheelR: { position: 'absolute', bottom: 2, left: 10, right: 10, height: 12, borderRadius: 6, borderWidth: 1.5 },
  vMotoBody: { position: 'absolute', top: 12, bottom: 12, left: 16, right: 16, borderRadius: 8, borderWidth: 1.5 },
  vMotoHandlebar: { position: 'absolute', top: 14, left: 6, right: 6, height: 5, borderRadius: 3, borderWidth: 1 },
  vMotoSeat: { position: 'absolute', top: 22, left: 18, right: 18, height: 12, borderRadius: 4 },
  vMotoEngine: { position: 'absolute', top: 28, left: 20, right: 20, height: 8, borderRadius: 3, borderWidth: 1 },
});
