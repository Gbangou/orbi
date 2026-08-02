import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  QuickActionCard,
  SectionCard,
  SectionHeading,
} from './realtime-widgets';

export type DriverJourneyStepId =
  | 'auth'
  | 'accueil'
  | 'offres'
  | 'revenus'
  | 'profil';

const driverJourneySteps: Array<{
  id: DriverJourneyStepId;
  href: '/auth' | '/accueil' | '/offres' | '/revenus' | '/profil';
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'auth',
    href: '/auth',
    eyebrow: 'Acces',
    title: 'Connexion et activation',
    description: 'Ouvrir la session chauffeur et reprendre le service.',
  },
  {
    id: 'accueil',
    href: '/accueil',
    eyebrow: 'Accueil',
    title: 'Accueil chauffeur',
    description: 'Voir le statut, les offres et les revenus immediats.',
  },
  {
    id: 'offres',
    href: '/offres',
    eyebrow: 'Courses',
    title: 'Voir toutes les offres',
    description: 'Gerer les reservations et les actions de course.',
  },
  {
    id: 'revenus',
    href: '/revenus',
    eyebrow: 'Finance',
    title: 'Revenus et performance',
    description: 'Suivre les gains du jour, les courses clôturées et la cadence.',
  },
  {
    id: 'profil',
    href: '/profil',
    eyebrow: 'Profil',
    title: 'Profil et vehicule',
    description: 'Suivre les documents et le vehicule actif.',
  },
];

export function DriverJourneySection({
  currentStep,
  description,
}: {
  currentStep: DriverJourneyStepId;
  description?: string;
}) {
  const router = useRouter();
  const currentStepIndex = driverJourneySteps.findIndex(
    (step) => step.id === currentStep,
  );

  return (
    <SectionCard tone="sky">
      <SectionHeading
        eyebrow="Parcours chauffeur"
        title="Parcours chauffeur"
        description={
          description ??
          'Acces, accueil, courses, revenus et profil restent connectes dans un parcours simple.'
        }
      />
      <View style={styles.actions}>
        {driverJourneySteps.map((step, index) => {
          const isCurrent = step.id === currentStep;
          const isCompleted =
            currentStepIndex > -1 && index < currentStepIndex;
          const tone = isCurrent
            ? 'amber'
            : isCompleted
              ? 'sky'
              : 'teal';

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
