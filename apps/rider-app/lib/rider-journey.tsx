import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  QuickActionCard,
  SectionCard,
  SectionHeading,
} from './realtime-widgets';

export type RiderJourneyStepId =
  | 'auth'
  | 'home'
  | 'book'
  | 'account'
  | 'voice'
  | 'activity';

const riderJourneySteps: Array<{
  id: RiderJourneyStepId;
  href: '/auth' | '/home' | '/book' | '/account' | '/voice' | '/activity';
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'auth',
    href: '/auth',
    eyebrow: 'Acces',
    title: 'Connexion et compte',
    description: 'Ouvrir la session passager et reprendre vos donnees.',
  },
  {
    id: 'home',
    href: '/home',
    eyebrow: 'Accueil',
    title: 'Cockpit passager',
    description: 'Voir le flux actif, les options et les raccourcis utiles.',
  },
  {
    id: 'book',
    href: '/book',
    eyebrow: 'Reservation',
    title: 'Ouvrir la reservation',
    description: 'Choisir le service, les lieux et le paiement.',
  },
  {
    id: 'account',
    href: '/account',
    eyebrow: 'Compte',
    title: 'Gerer le profil',
    description: 'Retrouver les favoris, les preferences et la session rider.',
  },
  {
    id: 'voice',
    href: '/voice',
    eyebrow: 'Voice',
    title: 'Rechercher par la voix',
    description: 'Interpreter une phrase libre et proposer des lieux fiables.',
  },
  {
    id: 'activity',
    href: '/activity',
    eyebrow: 'Suivi',
    title: 'Historique des trajets',
    description: 'Suivre les transitions live, l historique et les incidents.',
  },
];

export function RiderJourneySection({
  currentStep,
  description,
}: {
  currentStep: RiderJourneyStepId;
  description?: string;
}) {
  const router = useRouter();
  const currentStepIndex = riderJourneySteps.findIndex(
    (step) => step.id === currentStep,
  );

  return (
    <SectionCard tone="sky">
      <SectionHeading
        eyebrow="Parcours rider"
        title="Tunnel passager continu"
        description={
          description ??
          'Le meme fil conducteur vous accompagne de la connexion a la reservation, puis jusqu au suivi live.'
        }
      />
      <View style={styles.actions}>
        {riderJourneySteps.map((step, index) => {
          const isCurrent = step.id === currentStep;
          const isCompleted =
            currentStepIndex > -1 && index < currentStepIndex;
          const tone = isCurrent
            ? 'teal'
            : isCompleted
              ? 'sky'
              : 'amber';

          return (
            <QuickActionCard
              key={step.id}
              eyebrow={step.eyebrow}
              title={step.title}
              description={
                isCurrent
                  ? `Vous etes ici. ${step.description}`
                  : step.description
              }
              tone={tone}
              emphasis={isCurrent ? 'primary' : 'secondary'}
              onPress={() => router.push(step.href)}
            />
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
  },
});
