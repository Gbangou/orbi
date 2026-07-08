import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { rateTripWithApi, type TripRatingResponse } from '@orbi/api';
import { formatXof, orbiTheme } from '@orbi/ui';
import { OrbiButton, OrbiStatusBanner, OrbiSurface } from '@orbi/ui/native';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import { OrbiLogo } from '../lib/orbi-logo';

const MAX_COMMENT = 280;
const STAR_LABELS = ['', 'Mauvais', 'Passable', 'Correct', 'Bien', 'Excellent'];

const STAR_A11Y = ['', '1 étoile', '2 étoiles', '3 étoiles', '4 étoiles', '5 étoiles'];

function StarIcon({
  filled,
  index,
  animated,
  onPress,
}: {
  filled: boolean;
  index: number;
  animated: Animated.Value;
  onPress: () => void;
}) {
  const scale = animated.interpolate({
    inputRange: [0, 0.45, 0.7, 1],
    outputRange: [1, 1.42, 1.18, 1],
  });
  const rotate = animated.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '-12deg', '0deg'],
  });

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={STAR_A11Y[index + 1]}
      accessibilityState={{ selected: filled }}
    >
      <Animated.View
        style={[styles.star, { transform: [{ scale }, { rotate }] }]}
      >
        <Text
          style={[
            styles.starGlyph,
            filled ? styles.starGlyphFilled : styles.starGlyphEmpty,
          ]}
          selectable={false}
        >
          ★
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function RatingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId: string;
    driverName?: string;
    fare?: string;
    destination?: string;
  }>();

  const tripId = params.tripId ?? '';
  const driverName = params.driverName ?? 'Votre chauffeur';
  const fare = params.fare ? Number(params.fare) : null;
  const destination = params.destination ?? null;

  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [ratingResult, setRatingResult] = useState<TripRatingResponse | null>(null);
  const starAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0)),
  ).current;
  const submissionLockRef = useRef(false);

  const animateStar = useCallback(
    (index: number) => {
      const anim = starAnims[index];
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: false,
      }).start();
    },
    [starAnims],
  );

  function handleStarPress(starScore: number) {
    if (status !== 'idle') return;
    setScore(starScore);
    for (let i = 0; i < starScore; i++) {
      setTimeout(() => animateStar(i), i * 50);
    }
  }

  async function handleSubmit() {
    if (submissionLockRef.current || status !== 'idle') return;
    if (score === 0) {
      setStatusMessage('Veuillez choisir une note avant de valider.');
      return;
    }
    if (!tripId) {
      setStatusMessage('Identifiant de course manquant.');
      return;
    }

    submissionLockRef.current = true;
    setStatus('submitting');
    setStatusMessage('Envoi de votre evaluation...');
    Keyboard.dismiss();

    try {
      const { authClient } = await restoreRiderSession();
      const result = await rateTripWithApi(authClient, tripId, {
        score,
        comment: comment.trim() || undefined,
      });
      setRatingResult(result);
      setStatus('done');
      setStatusMessage('Merci pour votre evaluation !');
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "L'evaluation n'a pas pu etre enregistree.",
      });
      setStatus('error');
      setStatusMessage(feedback.message);
    } finally {
      submissionLockRef.current = false;
    }
  }

  function handleSkip() {
    router.replace('/home');
  }

  function handleDone() {
    router.replace('/home');
  }

  if (status === 'done') {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <OrbiSurface tone="teal" style={styles.doneCard} elevated>
          <View style={styles.doneIcon}>
            <View style={styles.checkOuter}>
              <View style={styles.checkInner} />
            </View>
          </View>
          <Text style={styles.doneTitle}>Merci !</Text>
          <Text style={styles.doneBody}>
            Votre evaluation a ete transmise.
            {ratingResult ? ` Note enregistree: ${ratingResult.rating.score}/5.` : ''}
          </Text>
          {score >= 4 ? (
            <Text style={styles.doneTip}>
              Votre avis positif aide les bons chauffeurs a se distinguer dans le dispatch.
            </Text>
          ) : (
            <Text style={styles.doneTip}>
              Votre retour aide les operations a maintenir un haut niveau de service.
            </Text>
          )}
          <OrbiButton
            label="Retour a l'accueil"
            onPress={handleDone}
            tone="teal"
            style={styles.doneButton}
          />
        </OrbiSurface>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <OrbiLogo size="sm" />
        <Text style={styles.title}>Evaluer votre course</Text>
        {destination ? (
          <Text style={styles.subtitle}>Vers {destination}</Text>
        ) : null}
      </View>

      <OrbiSurface style={styles.summaryCard} elevated>
        <View style={styles.summaryTop}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {driverName
                .split(' ')
                .slice(0, 2)
                .map((n) => n.charAt(0).toUpperCase())
                .join('')}
            </Text>
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryName}>{driverName}</Text>
            <Text style={styles.summaryMeta}>Chauffeur Orbi certifie</Text>
            {fare !== null ? (
              <Text style={styles.summaryFare}>{formatXof(fare)}</Text>
            ) : null}
          </View>
        </View>
      </OrbiSurface>

      <OrbiSurface tone={score >= 4 ? 'teal' : score > 0 ? 'amber' : 'neutral'} style={styles.ratingBlock}>
        <Text style={styles.ratingQuestion}>Comment s est passe votre trajet ?</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((starScore) => (
            <StarIcon
              key={starScore}
              filled={starScore <= score}
              index={starScore - 1}
              animated={starAnims[starScore - 1]}
              onPress={() => handleStarPress(starScore)}
            />
          ))}
        </View>
        {score > 0 ? (
          <Text style={styles.ratingLabel}>{STAR_LABELS[score]}</Text>
        ) : (
          <Text style={styles.ratingPlaceholder}>Appuyez sur une etoile</Text>
        )}
      </OrbiSurface>

      {score > 0 ? (
        <OrbiSurface style={styles.commentBlock}>
          <Text style={styles.commentLabel}>
            Commentaire facultatif
          </Text>
          <TextInput
            value={comment}
            onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT))}
            placeholder={
              score <= 2
                ? "Qu est-ce qui s est mal passe ?"
                : 'Un detail a partager ? (facultatif)'
            }
            placeholderTextColor={orbiTheme.colors.muted}
            multiline
            numberOfLines={3}
            style={styles.commentInput}
            editable={status === 'idle'}
          />
          <Text style={styles.commentCounter}>
            {comment.length}/{MAX_COMMENT}
          </Text>
        </OrbiSurface>
      ) : null}

      {statusMessage ? (
        <OrbiStatusBanner
          title={status === 'error' ? 'Evaluation non envoyee' : 'Evaluation'}
          message={statusMessage}
          tone={status === 'error' ? 'danger' : 'sky'}
        />
      ) : null}

      <View style={styles.actions}>
        <OrbiButton
          label={status === 'submitting' ? 'Envoi en cours...' : 'Valider mon evaluation'}
          onPress={handleSubmit}
          loading={status === 'submitting'}
          disabled={status === 'submitting' || score === 0}
          tone={score >= 4 ? 'teal' : score > 0 ? 'amber' : 'teal'}
        />
        <OrbiButton
          label="Passer pour l'instant"
          onPress={handleSkip}
          disabled={status === 'submitting'}
          variant="ghost"
          tone="teal"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 72,
    paddingHorizontal: 24,
    paddingBottom: 48,
    backgroundColor: orbiTheme.colors.riderBackground,
    gap: 20,
  },
  header: {
    gap: 6,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 34,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    lineHeight: 36,
  },
  subtitle: {
    color: orbiTheme.colors.muted,
    lineHeight: 20,
  },
  summaryCard: {
    padding: 18,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: orbiTheme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  summaryCopy: {
    flex: 1,
    gap: 3,
  },
  summaryName: {
    color: orbiTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
  },
  summaryMeta: {
    color: orbiTheme.colors.muted,
    fontSize: 13,
  },
  summaryFare: {
    color: orbiTheme.colors.teal,
    fontWeight: '700',
    fontSize: 15,
    marginTop: 2,
  },
  ratingBlock: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  ratingQuestion: {
    color: orbiTheme.colors.text,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  star: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlyph: {
    fontSize: 42,
    lineHeight: 50,
    textAlign: 'center',
  },
  starGlyphFilled: {
    color: orbiTheme.colors.amber,
    // Halo lumineux sur les étoiles sélectionnées
    textShadowColor: 'rgba(245, 158, 11, 0.55)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  starGlyphEmpty: {
    color: '#D0D0D0',
  },
  ratingLabel: {
    color: orbiTheme.colors.amber,
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 0,
  },
  ratingPlaceholder: {
    color: orbiTheme.colors.muted,
    fontSize: 14,
  },
  commentBlock: {
    gap: 8,
    padding: 16,
  },
  commentLabel: {
    color: orbiTheme.colors.textSoft,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  commentInput: {
    backgroundColor: orbiTheme.colors.panel,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: 16,
    padding: 14,
    color: orbiTheme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
    minHeight: 90,
  },
  commentCounter: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
    textAlign: 'right',
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  doneCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  doneIcon: {
    marginBottom: 8,
  },
  checkOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: orbiTheme.colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInner: {
    width: 28,
    height: 14,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '-45deg' }],
    marginTop: -4,
  },
  doneTitle: {
    color: orbiTheme.colors.text,
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  doneBody: {
    color: orbiTheme.colors.textSoft,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 16,
  },
  doneTip: {
    color: orbiTheme.colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
    maxWidth: 320,
  },
  doneButton: {
    marginTop: 8,
    alignSelf: 'stretch',
  },
});
