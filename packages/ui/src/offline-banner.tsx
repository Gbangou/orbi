import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useNetworkStatus } from './use-network-status';
import { useOrbiTheme } from './theme-context';

export function OfflineBanner() {
  const status = useNetworkStatus();
  const theme = useOrbiTheme();
  const translateY = useRef(new Animated.Value(-56)).current;
  const visible = status === 'offline';

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : -56,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [visible, translateY]);

  if (status === 'unknown') return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.inner, { backgroundColor: theme.colors.text }]}>
        <Text style={[styles.dot, { color: theme.colors.warning }]}>●</Text>
        <Text style={[styles.label, { color: theme.colors.textInverse }]}>
          Hors ligne - les donnees affichees peuvent dater un peu
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  dot: {
    fontSize: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
    flex: 1,
  },
});
