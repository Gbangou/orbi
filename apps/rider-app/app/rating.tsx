import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { type OrbiTheme } from '@orbi/ui';
import {
  OrbiButton,
  OrbiStatusBanner,
  OrbiSurface,
  PersonBadge,
  TripStageTracker,
  useOrbiTheme,
} from '@orbi/ui/native';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import { OrbiLogo } from '../lib/orbi-logo';
import { formatRiderMoneyAmount, resolveRiderMoneyAmount } from '../lib/rider-display-format';

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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{
    tripId: string;
    driverName?: string;
    fare?: string;
    destination?: string;
  }>();

  const tripId = params.tripId ?? '';
  const driverName = params.driverName ?? 'Votre chauffeur';
  const fare = resolveRiderMoneyAmount(params.fare);
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
      <ScrollView style={styles.root} contentContainerStyle={styles.screen}>
        <OrbiSurface tone="teal" style={styles.doneCard}>
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
          <Text style={styles.doneTip}>
            Merci pour votre retour.
          </Text>
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
      style={styles.root}
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

      <TripStageTracker status="COMPLETED" audience="rider" style={styles.stageTracker} />

      <OrbiSurface style={styles.summaryCard}>
        <PersonBadge name={driverName} subtitle="Chauffeur Orbi certifié" size={56} />
        {fare !== null ? (
          <Text style={styles.summaryFare}>{formatRiderMoneyAmount(fare)}</Text>
        ) : null}
      </OrbiSurface>

      <OrbiSurface tone={score >= 4 ? 'teal' : score > 0 ? 'amber' : 'neutral'} style={styles.ratingBlock}>
        <Text style={styles.ratingQuestion} numberOfLines={2}>
          Comment s est passe votre trajet ?
        </Text>
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
            placeholderTextColor={theme.colors.muted}
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

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  screen: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 48,
    backgroundColor: '#FFFFFF',
    gap: 20,
  },
  header: {
    gap: 6,
  },
  title: {
    color: '#111111',
    fontSize: 32,
    fontWeight: '900',
    fontFamily: 'Raleway_800ExtraBold',
    lineHeight: 36,
  },
  subtitle: {
    color: '#525252',
    lineHeight: 20,
  },
  stageTracker: {
    marginTop: -4,
  },
  summaryCard: {
    padding: 18,
    gap: 10,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E8E8',
  },
  summaryFare: {
    color: '#111111',
    fontWeight: '800',
    fontSize: 15,
  },
  ratingBlock: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 18,
    borderRadius: 4,
    backgroundColor: '#F7F7F7',
    borderColor: '#E8E8E8',
  },
  ratingQuestion: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  star: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlyph: {
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
  },
  starGlyphFilled: {
    color: '#111111',
  },
  starGlyphEmpty: {
    color: '#D0D0D0',
  },
  ratingLabel: {
    color: '#111111',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 0,
  },
  ratingPlaceholder: {
    color: '#6B6B6B',
    fontSize: 14,
  },
  commentBlock: {
    gap: 8,
    padding: 16,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E8E8',
  },
  commentLabel: {
    color: '#525252',
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  commentInput: {
    backgroundColor: '#F3F3F3',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 4,
    padding: 14,
    color: '#111111',
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
    minHeight: 90,
  },
  commentCounter: {
    color: '#6B6B6B',
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
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  doneIcon: {
    marginBottom: 8,
  },
  checkOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#111111',
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
    color: '#111111',
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  doneBody: {
    color: '#525252',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 16,
  },
  doneTip: {
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
    maxWidth: 320,
  },
  doneButton: {
    marginTop: 8,
    alignSelf: 'stretch',
    borderRadius: 4,
    backgroundColor: '#111111',
  },
});
