/**
 * PaymentMethodsManager — Gestion des méthodes de paiement passager
 *
 * Affiche les méthodes de paiement disponibles et permet à l'utilisateur
 * de choisir sa méthode préférée.
 *
 * Méthodes supportées au Burkina Faso:
 *   1. Mobile Money (Orange Money, Moov Money) — principal
 *   2. Espèces — paiement à la fin du trajet
 *   3. Wallet Orbi — crédits prépayés (futur)
 *
 * Design Bolt-style: cards avec icônes, badge "Recommandé", tap-to-select.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { orbiTheme } from '@orbi/ui';
import type { PaymentMethod } from '@orbi/api';

type PaymentOption = {
  method: PaymentMethod;
  label: string;
  sublabel: string;
  icon: string;
  recommended?: boolean;
  available: boolean;
};

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    method: 'mobile-money',
    label: 'Mobile Money',
    sublabel: 'Orange Money · Moov Money',
    icon: '📱',
    recommended: true,
    available: true,
  },
  {
    method: 'cash',
    label: 'Espèces',
    sublabel: 'Paiement en fin de trajet',
    icon: '💵',
    available: true,
  },
  {
    method: 'wallet',
    label: 'Wallet Orbi',
    sublabel: 'Crédits prépayés · Bientôt disponible',
    icon: '👛',
    available: false,
  },
];

export interface PaymentMethodsManagerProps {
  selectedMethod: PaymentMethod;
  availableMethods?: PaymentMethod[];
  onSelect: (method: PaymentMethod) => void;
}

export const PaymentMethodsManager = memo(function PaymentMethodsManager({
  selectedMethod,
  availableMethods,
  onSelect,
}: PaymentMethodsManagerProps) {
  const options = PAYMENT_OPTIONS.filter(
    (o) => !availableMethods || availableMethods.includes(o.method),
  );

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = selectedMethod === option.method;
        const isDisabled = !option.available;

        return (
          <Pressable
            key={option.method}
            onPress={() => option.available && onSelect(option.method)}
            disabled={isDisabled}
            style={({ pressed }) => [
              styles.card,
              isSelected && styles.cardSelected,
              isDisabled && styles.cardDisabled,
              pressed && !isDisabled && styles.cardPressed,
            ]}
          >
            <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
              <Text style={styles.icon}>{option.icon}</Text>
            </View>

            <View style={styles.info}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, isDisabled && styles.labelDisabled]}>
                  {option.label}
                </Text>
                {option.recommended && !isDisabled ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Recommandé</Text>
                  </View>
                ) : null}
                {isDisabled ? (
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonBadgeText}>Bientôt</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.sublabel, isDisabled && styles.labelDisabled]}>
                {option.sublabel}
              </Text>
            </View>

            {/* Radio indicator */}
            <View style={[styles.radio, isSelected && styles.radioSelected]}>
              {isSelected ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.border,
    padding: 14,
  },
  cardSelected: {
    borderColor: orbiTheme.colors.teal,
    backgroundColor: 'rgba(0,201,167,0.04)',
  },
  cardDisabled: { opacity: 0.45 },
  cardPressed: { opacity: 0.82 },

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: orbiTheme.colors.backgroundDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: { backgroundColor: 'rgba(0,201,167,0.12)' },
  icon: { fontSize: 22 },

  info: { flex: 1, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.text,
  },
  labelDisabled: { color: orbiTheme.colors.textMuted },
  sublabel: {
    fontSize: 12,
    color: orbiTheme.colors.textSoft,
    fontFamily: 'Inter_400Regular',
  },

  badge: {
    backgroundColor: 'rgba(0,201,167,0.12)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.teal,
  },
  soonBadge: {
    backgroundColor: orbiTheme.colors.backgroundDim,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  soonBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.textMuted,
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: orbiTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: orbiTheme.colors.teal },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: orbiTheme.colors.teal,
  },
});
