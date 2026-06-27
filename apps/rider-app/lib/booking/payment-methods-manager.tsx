import { memo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { orbiTheme } from '@orbi/ui';
import type { PaymentMethod } from '@orbi/api';

export type MobileMoneyNetwork = 'ORANGE_BFA' | 'MOOV_BFA';

export type PaymentSelection =
  | { method: 'cash' }
  | { method: 'mobile-money'; network: MobileMoneyNetwork; phoneNumber: string }
  | { method: 'wallet' };

const MOBILE_MONEY_NETWORKS: Array<{
  id: MobileMoneyNetwork;
  label: string;
  sublabel: string;
}> = [
  {
    id: 'ORANGE_BFA',
    label: 'Orange Money',
    sublabel: 'Numéro Orange Burkina Faso',
  },
  {
    id: 'MOOV_BFA',
    label: 'Moov Money',
    sublabel: 'Numéro Moov/Telecel Burkina Faso',
  },
];

export interface PaymentMethodsManagerProps {
  selectedMethod: PaymentMethod;
  availableMethods?: PaymentMethod[];
  onSelect: (method: PaymentMethod) => void;
  onSelectionChange?: (selection: PaymentSelection) => void;
}

export const PaymentMethodsManager = memo(function PaymentMethodsManager({
  selectedMethod,
  availableMethods,
  onSelect,
  onSelectionChange,
}: PaymentMethodsManagerProps) {
  const [selectedNetwork, setSelectedNetwork] =
    useState<MobileMoneyNetwork>('ORANGE_BFA');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const isMobileMoney = selectedMethod === 'mobile-money';
  const showMobileMoney =
    !availableMethods || availableMethods.includes('mobile-money');
  const showCash = !availableMethods || availableMethods.includes('cash');

  function handleNetworkSelect(network: MobileMoneyNetwork) {
    setSelectedNetwork(network);
    if (isMobileMoney && onSelectionChange) {
      onSelectionChange({
        method: 'mobile-money',
        network,
        phoneNumber: phoneNumber.replace(/\D/g, ''),
      });
    }
  }

  function handlePhoneChange(raw: string) {
    const digits = raw.replace(/\D/g, '');
    setPhoneNumber(digits);
    setPhoneError('');
    if (isMobileMoney && onSelectionChange) {
      onSelectionChange({
        method: 'mobile-money',
        network: selectedNetwork,
        phoneNumber: digits,
      });
    }
  }

  function handlePhoneBlur() {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits && (digits.length < 8 || digits.length > 13)) {
      setPhoneError('Numéro invalide — ex. 70 12 34 56');
    }
  }

  function handleSelectMethod(method: PaymentMethod) {
    onSelect(method);
    if (method === 'mobile-money' && onSelectionChange) {
      onSelectionChange({
        method: 'mobile-money',
        network: selectedNetwork,
        phoneNumber: phoneNumber.replace(/\D/g, ''),
      });
    } else if (method === 'cash' && onSelectionChange) {
      onSelectionChange({ method: 'cash' });
    } else if (method === 'wallet' && onSelectionChange) {
      onSelectionChange({ method: 'wallet' });
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>Moyen de paiement</Text>

      {/* ── Mobile Money ── */}
      {showMobileMoney && (
        <Pressable
          onPress={() => handleSelectMethod('mobile-money')}
          style={({ pressed }) => [
            styles.card,
            isMobileMoney && styles.cardSelected,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={[styles.iconWrap, isMobileMoney && styles.iconWrapSelected]}>
            <Text style={styles.icon}>📱</Text>
          </View>

          <View style={styles.info}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Mobile Money</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Recommandé</Text>
              </View>
            </View>
            <Text style={styles.sublabel}>Orange Money · Moov Money</Text>
          </View>

          <View style={[styles.radio, isMobileMoney && styles.radioSelected]}>
            {isMobileMoney && <View style={styles.radioDot} />}
          </View>
        </Pressable>
      )}

      {/* ── Mobile Money expanded panel ── */}
      {isMobileMoney && (
        <View style={styles.mobileMoneyPanel}>
          {/* Network selector */}
          <Text style={styles.panelLabel}>Sélectionnez votre réseau</Text>
          <View style={styles.networkRow}>
            {MOBILE_MONEY_NETWORKS.map((net) => {
              const isActive = selectedNetwork === net.id;
              return (
                <Pressable
                  key={net.id}
                  onPress={() => handleNetworkSelect(net.id)}
                  style={({ pressed }) => [
                    styles.networkChip,
                    isActive && styles.networkChipActive,
                    pressed && styles.networkChipPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.networkDot,
                      isActive && styles.networkDotActive,
                    ]}
                  />
                  <View>
                    <Text
                      style={[
                        styles.networkLabel,
                        isActive && styles.networkLabelActive,
                      ]}
                    >
                      {net.label}
                    </Text>
                    <Text style={styles.networkSublabel}>{net.sublabel}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Phone number input */}
          <Text style={[styles.panelLabel, { marginTop: 14 }]}>
            Numéro de téléphone
          </Text>
          <View
            style={[
              styles.phoneInputWrap,
              phoneError ? styles.phoneInputError : null,
            ]}
          >
            <Text style={styles.phonePrefix}>+226</Text>
            <TextInput
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={handlePhoneChange}
              onBlur={handlePhoneBlur}
              placeholder="70 12 34 56"
              placeholderTextColor={orbiTheme.colors.textMuted}
              keyboardType="phone-pad"
              maxLength={13}
              returnKeyType="done"
              autoComplete="tel"
            />
          </View>
          {phoneError ? (
            <Text style={styles.errorText}>{phoneError}</Text>
          ) : null}

          <View style={styles.ussdNote}>
            <Text style={styles.ussdNoteText}>
              Vous recevrez une notification USSD pour confirmer le paiement
            </Text>
          </View>
        </View>
      )}

      {/* ── Cash ── */}
      {showCash && (
        <Pressable
          onPress={() => handleSelectMethod('cash')}
          style={({ pressed }) => [
            styles.card,
            selectedMethod === 'cash' && styles.cardSelected,
            pressed && styles.cardPressed,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              selectedMethod === 'cash' && styles.iconWrapSelected,
            ]}
          >
            <Text style={styles.icon}>💵</Text>
          </View>

          <View style={styles.info}>
            <Text style={styles.label}>Espèces</Text>
            <Text style={styles.sublabel}>Paiement en fin de trajet</Text>
          </View>

          <View
            style={[
              styles.radio,
              selectedMethod === 'cash' && styles.radioSelected,
            ]}
          >
            {selectedMethod === 'cash' && <View style={styles.radioDot} />}
          </View>
        </Pressable>
      )}

      {/* ── Wallet — coming soon ── */}
      <Pressable style={[styles.card, styles.cardDisabled]} disabled>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>👛</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelDisabled]}>
              Wallet Orbi
            </Text>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>Bientôt</Text>
            </View>
          </View>
          <Text style={[styles.sublabel, styles.labelDisabled]}>
            Crédits prépayés
          </Text>
        </View>
        <View style={styles.radio} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: 10 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: orbiTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },

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

  // Mobile Money expanded panel
  mobileMoneyPanel: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.teal,
    padding: 16,
    gap: 8,
    marginTop: -4,
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.textSoft,
  },

  networkRow: { gap: 8 },
  networkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.border,
    backgroundColor: '#FFFFFF',
  },
  networkChipActive: {
    borderColor: orbiTheme.colors.teal,
    backgroundColor: 'rgba(0,201,167,0.04)',
  },
  networkChipPressed: { opacity: 0.8 },
  networkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: orbiTheme.colors.border,
  },
  networkDotActive: {
    borderColor: orbiTheme.colors.teal,
    backgroundColor: orbiTheme.colors.teal,
  },
  networkLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
  },
  networkLabelActive: { color: orbiTheme.colors.teal },
  networkSublabel: {
    fontSize: 11,
    color: orbiTheme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: orbiTheme.colors.border,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  phoneInputError: { borderColor: '#FF3B30' },
  phonePrefix: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: orbiTheme.colors.text,
    borderRightWidth: 1,
    borderRightColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundDim,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    color: orbiTheme.colors.text,
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    fontFamily: 'Inter_400Regular',
    marginTop: -2,
  },

  ussdNote: {
    backgroundColor: 'rgba(0,201,167,0.07)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  ussdNoteText: {
    fontSize: 12,
    color: orbiTheme.colors.teal,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
});
