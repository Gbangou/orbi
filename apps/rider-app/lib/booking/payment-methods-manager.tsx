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
              placeholderTextColor="#6B6B6B"
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
          message="Le paiement sera confirmé avec votre réservation."
        />
      )}
    </View>
  );
});

const makeStyles = (_theme: OrbiTheme) => StyleSheet.create({
  root: { gap: 8 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#6B6B6B',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 2,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardSelected: {
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
  },
  cardPressed: { opacity: 0.82 },

  iconWrap: {
    width: 40,
    height: 38,
    borderRadius: 4,
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: { backgroundColor: '#111111' },
  icon: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#6B6B6B',
    letterSpacing: 0,
  },
  iconSelected: { color: '#FFFFFF' },

  info: { flex: 1, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
  },
  sublabel: {
    fontSize: 11,
    color: '#5F5F5F',
    fontFamily: 'Inter_400Regular',
  },

  badge: {
    backgroundColor: '#F3F3F3',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#111111',
  },
  walletBadge: {
    backgroundColor: '#F3F3F3',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  walletBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#111111',
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CFCFCF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: '#111111' },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#111111',
  },

  // Mobile Money expanded panel
  mobileMoneyPanel: {
    borderRadius: 4,
    padding: 12,
    gap: 7,
    marginTop: -4,
    backgroundColor: '#F7F7F7',
    borderColor: '#E8E8E8',
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#5F5F5F',
  },

  networkRow: { gap: 7 },
  networkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  networkChipActive: {
    borderColor: '#111111',
    backgroundColor: '#FFFFFF',
  },
  networkChipPressed: { opacity: 0.8 },
  networkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#CFCFCF',
  },
  networkDotActive: {
    borderColor: '#111111',
    backgroundColor: '#111111',
  },
  networkLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#111111',
  },
  networkLabelActive: { color: '#111111' },
  networkSublabel: {
    fontSize: 10,
    color: '#6B6B6B',
    fontFamily: 'Inter_400Regular',
  },

  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  phoneInputError: { borderColor: '#000000' },
  phonePrefix: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: '#111111',
    borderRightWidth: 1,
    borderRightColor: '#E8E8E8',
    backgroundColor: '#F3F3F3',
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    color: '#111111',
    letterSpacing: 0,
  },
  errorText: {
    fontSize: 12,
    color: '#000000',
    fontFamily: 'Inter_400Regular',
    marginTop: -2,
  },

});
