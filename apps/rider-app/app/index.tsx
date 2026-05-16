import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { orbiTheme } from '@orbi/ui';
import { hasPersistedRiderSession } from '../lib/auth';
import {
  InsightBadge,
  SectionCard,
  SectionHeading,
} from '../lib/realtime-widgets';

export default function IndexScreen() {
  useEffect(() => {
    let isMounted = true;

    async function handoff() {
      const hasSession = await hasPersistedRiderSession();

      if (!isMounted) {
        return;
      }

      router.replace(hasSession ? '/home' : '/auth');
    }

    void handoff();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>Orbi Passager</Text>
      <Text style={styles.title}>Ouverture du tunnel rider</Text>
      <Text style={styles.body}>
        Verification de la session et reprise du bon ecran pour continuer sans friction.
      </Text>

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Handoff"
          title="Preparation du bon ecran"
          description="L application verifie d abord si une session passager existe, puis vous redirige vers l accueil ou l acces."
        />
        <View style={styles.insightRow}>
          <InsightBadge label="Session" value="Verification" tone="sky" />
          <InsightBadge label="Tunnel" value="Continu" tone="teal" />
          <InsightBadge label="Etat" value="Redirection" tone="amber" />
        </View>
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: orbiTheme.colors.background,
    gap: 16,
  },
  eyebrow: {
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  body: {
    color: orbiTheme.colors.muted,
    lineHeight: 22,
  },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
