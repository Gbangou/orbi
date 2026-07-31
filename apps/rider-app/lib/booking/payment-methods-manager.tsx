import { memo, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { OrbiTheme } from '@orbi/ui';
import { OrbiStatusBanner, OrbiSurface, useOrbiTheme } from '@orbi/ui/native';
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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [selectedNetwork, setSelectedNetwork] =
    useState<MobileMoneyNetwork>('ORANGE_BFA');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const isMobileMoney = selectedMethod === 'mobile-money';
  const showMobileMoney =
    !availableMethods || availableMethods.includes('mobile-money');
  const showCash = !availableMethods || availableMethods.includes('cash');
  const showWallet = !availableMethods || availableMethods.includes('wallet');

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
            <Text style={[styles.icon, isMobileMoney && styles.iconSelected]}>MM</Text>
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
        <OrbiSurface tone="teal" style={styles.mobileMoneyPanel}>
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
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              maxLength={13}
              returnKeyType="done"
              autoComplete="tel"
            />
          </View>
          {phoneError ? (
            <Text style={styles.errorText}>{phoneError}</Text>
          ) : null}

          <OrbiStatusBanner
            tone="teal"
            title="Confirmation sécurisée"
            message="Vous recevrez une notification USSD pour confirmer le paiement."
          />
        </OrbiSurface>
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
            <Text style={[styles.icon, selectedMethod === 'cash' && styles.iconSelected]}>XOF</Text>
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

      {/* ── Wallet ── */}
      {showWallet && (
        <Pressable
          onPress={() => handleSelectMethod('wallet')}
          style={({ pressed }) => [
            styles.card,
            selectedMethod === 'wallet' && styles.cardSelected,
            pressed && styles.cardPressed,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              selectedMethod === 'wallet' && styles.iconWrapSelected,
            ]}
          >
            <Text
              style={[
                styles.icon,
                selectedMethod === 'wallet' && styles.iconSelected,
              ]}
            >
              OR
            </Text>
          </View>

          <View style={styles.info}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Wallet Orbi</Text>
              <View style={styles.walletBadge}>
                <Text style={styles.walletBadgeText}>Prépayé</Text>
              </View>
            </View>
            <Text style={styles.sublabel}>
              Paiement instantané avec solde Orbi
            </Text>
          </View>

          <View
            style={[
              styles.radio,
              selectedMethod === 'wallet' && styles.radioSelected,
            ]}
          >
            {selectedMethod === 'wallet' && <View style={styles.radioDot} />}
          </View>
        </Pressable>
      )}

      {selectedMethod === 'wallet' && (
        <OrbiStatusBanner
          tone="teal"
          title="Wallet sécurisé"
          message="Le débit wallet reste lié à la demande de course et à son idempotency key."
        />
      )}
    </View>
  );
});

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  root: { gap: 8 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 2,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardSelected: {
    borderColor: theme.colors.teal,
    backgroundColor: 'rgba(0,201,167,0.04)',
  },
  cardPressed: { opacity: 0.82 },

  iconWrap: {
    width: 40,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: { backgroundColor: 'rgba(0,201,167,0.12)' },
  icon: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.textMuted,
    letterSpacing: 0,
  },
  iconSelected: { color: theme.colors.teal },

  info: { flex: 1, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  sublabel: {
    fontSize: 11,
    color: theme.colors.textSoft,
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
    color: theme.colors.teal,
  },
  walletBadge: {
    backgroundColor: 'rgba(0,201,167,0.12)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  walletBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.teal,
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: theme.colors.teal },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.teal,
  },

  // Mobile Money expanded panel
  mobileMoneyPanel: {
    borderRadius: 14,
    padding: 12,
    gap: 7,
    marginTop: -4,
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.textSoft,
  },

  networkRow: { gap: 7 },
  networkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  networkChipActive: {
    borderColor: theme.colors.teal,
    backgroundColor: 'rgba(0,201,167,0.04)',
  },
  networkChipPressed: { opacity: 0.8 },
  networkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  networkDotActive: {
    borderColor: theme.colors.teal,
    backgroundColor: theme.colors.teal,
  },
  networkLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  networkLabelActive: { color: theme.colors.teal },
  networkSublabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },

  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  phoneInputError: { borderColor: '#000000' },
  phonePrefix: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundDim,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    color: theme.colors.text,
    letterSpacing: 0,
  },
  errorText: {
    fontSize: 12,
    color: '#000000',
    fontFamily: 'Inter_400Regular',
    marginTop: -2,
  },

});
