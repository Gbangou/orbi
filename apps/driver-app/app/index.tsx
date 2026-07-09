import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { hasPersistedDriverSession } from '../lib/auth';
import {
  InsightBadge,
  SectionCard,
  SectionHeading,
} from '../lib/realtime-widgets';
import { OrbiLogo } from '../lib/orbi-logo';

export default function IndexScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEffect(() => {
    let isMounted = true;

    async function handoff() {
      const hasSession = await hasPersistedDriverSession();

      if (!isMounted) {
        return;
      }

      router.replace(hasSession ? '/accueil' : '/auth');
    }

    void handoff();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <OrbiLogo size="sm" />
      <Text style={styles.title}>Ouverture du tunnel chauffeur</Text>
      <Text style={styles.body}>
        Verification de la session et preparation du bon point d entree pour reprendre sans friction.
      </Text>

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Handoff"
          title="Preparation du bon ecran"
          description="L application regarde si la session chauffeur existe puis vous redirige vers l accueil ou l acces securise."
        />
        <View style={styles.insightRow}>
          <InsightBadge label="Session" value="Verification" tone="sky" />
          <InsightBadge label="Cockpit" value="Continu" tone="amber" />
          <InsightBadge label="Etat" value="Redirection" tone="teal" />
        </View>
      </SectionCard>
    </ScrollView>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: theme.colors.driverBackground,
    gap: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  body: {
    color: theme.colors.muted,
    lineHeight: 22,
  },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
