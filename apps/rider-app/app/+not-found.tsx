import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { orbiTheme } from '@orbi/ui';

export default function RiderNotFoundScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/');
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Ecran introuvable</Text>
      <Text style={styles.text}>Retour vers Orbi.</Text>
      <ActivityIndicator color={orbiTheme.colors.teal} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: orbiTheme.colors.riderBackground,
    padding: 24,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  text: {
    color: orbiTheme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
