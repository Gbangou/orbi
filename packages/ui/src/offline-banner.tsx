import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useNetworkStatus } from './use-network-status';

export function OfflineBanner() {
  const status = useNetworkStatus();
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
      <View style={styles.inner}>
        <Text style={styles.dot}>●</Text>
        <Text style={styles.label}>Hors ligne — les données affichées peuvent être obsolètes</Text>
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
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  dot: {
    fontSize: 8,
    color: '#FF9500',
  },
  label: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
    flex: 1,
  },
});
