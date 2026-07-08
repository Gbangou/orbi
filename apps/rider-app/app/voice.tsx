/**
 * Voice Screen — Recherche vocale en français
 *
 * Capture l'intention vocale de l'utilisateur via le moteur de reconnaissance
 * vocale natif du téléphone (gratuit, sur-appareil), envoie le transcript au
 * NLP backend Orbi et propose des lieux correspondant à Ouagadougou.
 *
 * Flow:
 *   1. Appui bouton → Voice.start() (moteur STT natif Android/iOS)
 *   2. Release → Voice.stop() → onSpeechResults livre le transcript final
 *   3. Transcript envoyé à POST /voice/location-intent
 *   4. Suggestions retournées → naviguer vers /book avec pré-remplissage
 */
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Voice, {
  type SpeechErrorEvent,
  type SpeechResultsEvent,
} from '@react-native-voice/voice';
import { createOrbiApiClient, resolveVoiceLocationIntentWithApi, type VoiceLocationIntentResponse } from '@orbi/api';
import { orbiTheme } from '@orbi/ui';
import { OrbiScreen, OrbiStatusBanner, OrbiSurface, safeHaptics } from '@orbi/ui/native';
import { orbiRuntimeConfig, resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';

const VOICE_LOCALE = 'fr-FR';

// ── Exemples de phrases ───────────────────────────────────────────────────────

const SAMPLE_PHRASES = [
  'Je vais à Ouaga 2000',
  'Université Joseph Ki-Zerbo',
  'Aéroport de Ouagadougou',
  'Marché Rood Woko',
  'Zone du Bois',
  'Hôtel Laïco',
] as const;

function BackGlyph() {
  return (
    <View style={voiceIcon.backWrap}>
      <View style={[voiceIcon.backLine, voiceIcon.backLineTop]} />
      <View style={[voiceIcon.backLine, voiceIcon.backLineBottom]} />
    </View>
  );
}

function ForwardGlyph() {
  return (
    <View style={voiceIcon.forwardWrap}>
      <View style={[voiceIcon.forwardLine, voiceIcon.forwardLineTop]} />
      <View style={[voiceIcon.forwardLine, voiceIcon.forwardLineBottom]} />
    </View>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

const SuggestionCard = memo(function SuggestionCard({
  name, address, district, confidence, onSelect,
}: {
  name: string;
  address: string;
  district: string;
  confidence: number;
  onSelect: () => void;
}) {
  const pct = Math.round(confidence * 100);
  const isStrong = confidence >= 0.75;
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [pressed && styles.suggCardPressed]}
    >
      <OrbiSurface style={styles.suggCard} elevated={isStrong}>
        <View style={styles.suggHeader}>
          <View style={[styles.confBadge, { backgroundColor: isStrong ? 'rgba(0,201,167,0.12)' : 'rgba(255,149,0,0.12)' }]}>
            <Text style={[styles.confText, { color: isStrong ? orbiTheme.colors.teal : orbiTheme.colors.amber }]}>{pct}%</Text>
          </View>
          <ForwardGlyph />
        </View>
        <Text style={styles.suggName}>{name}</Text>
        <Text style={styles.suggMeta}>{district} · {address}</Text>
      </OrbiSurface>
    </Pressable>
  );
});

// ── Mic button avec animation ─────────────────────────────────────────────────

const MicButton = memo(function MicButton({
  isRecording,
  onPressIn,
  onPressOut,
}: {
  isRecording: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: false }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: false }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulse.setValue(1);
    }
  }, [isRecording, pulse]);

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.micBtn,
          isRecording && styles.micBtnActive,
          { transform: [{ scale: pulse }] },
        ]}
      >
        <View style={styles.micGlyph} accessibilityElementsHidden>
          <View style={styles.micHead} />
          <View style={styles.micStem} />
          <View style={styles.micBase} />
        </View>
        {isRecording ? (
          <View style={styles.recDot} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VoiceScreen() {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<VoiceLocationIntentResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasSpokenRef = useRef(false);

  const analyseTranscript = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
        version: orbiRuntimeConfig.apiVersion,
      });
      const response = await resolveVoiceLocationIntentWithApi(client, { transcript: text.trim() });
      setResult(response);
    } catch {
      setErrorMsg('Service vocal indisponible. Réessayez dans un instant.');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const bestGuess = e.value?.[0];
      if (bestGuess) {
        hasSpokenRef.current = true;
        setTranscript(bestGuess);
        void analyseTranscript(bestGuess);
      }
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setIsRecording(false);
      setIsAnalyzing(false);
      setErrorMsg(
        e.error?.message
          ?? 'Reconnaissance vocale indisponible. Utilisez les suggestions ci-dessous.',
      );
    };

    Voice.onSpeechEnd = () => {
      setIsRecording(false);
      if (!hasSpokenRef.current) {
        setErrorMsg('Aucune parole détectée. Réessayez ou utilisez les suggestions.');
      }
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => undefined);
    };
  }, [analyseTranscript]);

  const startRecording = useCallback(async () => {
    hasSpokenRef.current = false;
    setTranscript('');
    setResult(null);
    setErrorMsg(null);
    safeHaptics.impact('medium');

    try {
      await Voice.start(VOICE_LOCALE);
      setIsRecording(true);
    } catch {
      setIsRecording(false);
      setErrorMsg('Micro indisponible. Utilisez les suggestions ci-dessous.');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;

    safeHaptics.impact('light');
    setIsAnalyzing(true);

    try {
      await Voice.stop();
    } catch {
      setIsRecording(false);
      setIsAnalyzing(false);
      setErrorMsg('Analyse vocale indisponible. Utilisez les suggestions ci-dessous.');
    }
  }, [isRecording]);

  function handleSelectSuggestion(s: VoiceLocationIntentResponse['suggestions'][number]) {
    safeHaptics.notify('success');
    router.push({
      pathname: '/book',
      params: {
        suggestionName: s.name,
        suggestionAddress: s.address,
        suggestionLat: String(s.latitude),
        suggestionLng: String(s.longitude),
      },
    });
  }

  return (
    <OrbiScreen audience="rider" style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <BackGlyph />
        </Pressable>
        <Text style={styles.headerTitle}>Recherche vocale</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Hero + mic button */}
        <OrbiSurface tone={isRecording ? 'danger' : isAnalyzing ? 'sky' : 'teal'} style={styles.hero} elevated>
          <MicButton
            isRecording={isRecording}
            onPressIn={() => void startRecording()}
            onPressOut={() => void stopRecording()}
          />
          <Text style={styles.heroTitle}>
            {isRecording ? 'Parlez maintenant…' : isAnalyzing ? 'Analyse en cours…' : 'Appuyez et parlez'}
          </Text>
          <Text style={styles.heroSub}>
            {isRecording
              ? 'Relâchez pour analyser'
              : 'Dites votre destination en français. Ex: "Je vais à Ouaga 2000"'}
          </Text>
          {transcript ? (
            <View style={styles.transcriptBubble}>
              <Text style={styles.transcriptText}>"{transcript}"</Text>
            </View>
          ) : null}
        </OrbiSurface>

        {/* Error */}
        {errorMsg ? (
          <OrbiStatusBanner
            title="Commande vocale indisponible"
            message={errorMsg}
            tone="danger"
          />
        ) : null}

        {/* Results */}
        {result && result.suggestions.length > 0 ? (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>
              {result.suggestions.length} lieu{result.suggestions.length > 1 ? 'x' : ''} trouvé{result.suggestions.length > 1 ? 's' : ''}
            </Text>
            {result.suggestions.map((s) => (
              <SuggestionCard
                key={`${s.name}-${s.district}`}
                name={s.name}
                address={s.address}
                district={s.district}
                confidence={s.confidence}
                onSelect={() => handleSelectSuggestion(s)}
              />
            ))}
          </View>
        ) : result && result.suggestions.length === 0 ? (
          <OrbiSurface style={styles.noResults}>
            <Text style={styles.noResultsTitle}>Aucun lieu identifié</Text>
            <Text style={styles.noResultsMeta}>Essayez avec les exemples ci-dessous</Text>
          </OrbiSurface>
        ) : null}

        {/* Sample phrases */}
        {!result ? (
          <OrbiSurface style={styles.samples}>
            <Text style={styles.samplesTitle}>Essayez avec</Text>
            <View style={styles.samplesGrid}>
              {SAMPLE_PHRASES.map((phrase) => (
                <Pressable
                  key={phrase}
                  onPress={() => { setTranscript(phrase); void analyseTranscript(phrase); }}
                  style={({ pressed }) => [styles.sampleChip, pressed && styles.sampleChipPressed]}
                >
                  <Text style={styles.sampleText}>{phrase}</Text>
                </Pressable>
              ))}
            </View>
          </OrbiSurface>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </OrbiScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: orbiTheme.colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: orbiTheme.colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  content: { paddingHorizontal: 20, paddingTop: 28, gap: 20 },

  // Hero
  hero: { alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 24 },
  micBtn: { width: 96, height: 96, borderRadius: 48, backgroundColor: orbiTheme.colors.backgroundAlt, borderWidth: 2, borderColor: orbiTheme.colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  micBtnActive: { backgroundColor: 'rgba(255,59,48,0.08)', borderColor: orbiTheme.colors.danger, shadowColor: orbiTheme.colors.danger, shadowOpacity: 0.3 },
  micGlyph: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  micHead: { width: 22, height: 28, borderRadius: 11, backgroundColor: orbiTheme.colors.text },
  micStem: { width: 4, height: 10, backgroundColor: orbiTheme.colors.text, marginTop: 2, borderRadius: 2 },
  micBase: { width: 24, height: 4, backgroundColor: orbiTheme.colors.text, borderRadius: 2, marginTop: 2 },
  recDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: orbiTheme.colors.danger },
  heroTitle: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text, textAlign: 'center' },
  heroSub: { fontSize: 14, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  transcriptBubble: { backgroundColor: orbiTheme.colors.backgroundAlt, borderRadius: 14, borderWidth: 1, borderColor: orbiTheme.colors.border, paddingHorizontal: 16, paddingVertical: 10, maxWidth: 300 },
  transcriptText: { fontSize: 15, fontStyle: 'italic', color: orbiTheme.colors.text, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Results
  results: { gap: 10 },
  resultsTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  suggCard: { padding: 14, gap: 6 },
  suggCardPressed: { opacity: 0.82 },
  suggHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  suggName: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  suggMeta: { fontSize: 12, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular' },

  // No results
  noResults: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 20, gap: 6 },
  noResultsTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  noResultsMeta: { fontSize: 13, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular' },

  // Samples
  samples: { gap: 12, padding: 14 },
  samplesTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.textMuted },
  samplesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sampleChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: orbiTheme.colors.backgroundAlt, borderWidth: 1, borderColor: orbiTheme.colors.border },
  sampleChipPressed: { opacity: 0.75 },
  sampleText: { fontSize: 13, fontWeight: '500', fontFamily: 'Inter_500Medium', color: orbiTheme.colors.textSoft },
});

const voiceIcon = StyleSheet.create({
  backWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLine: {
    position: 'absolute',
    width: 12,
    height: 2.5,
    borderRadius: 999,
    backgroundColor: orbiTheme.colors.text,
    left: 3,
  },
  backLineTop: {
    transform: [{ rotate: '-45deg' }, { translateY: -4 }],
  },
  backLineBottom: {
    transform: [{ rotate: '45deg' }, { translateY: 4 }],
  },
  forwardWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardLine: {
    position: 'absolute',
    width: 10,
    height: 2.5,
    borderRadius: 999,
    backgroundColor: orbiTheme.colors.teal,
    right: 3,
  },
  forwardLineTop: {
    transform: [{ rotate: '45deg' }, { translateY: -3 }],
  },
  forwardLineBottom: {
    transform: [{ rotate: '-45deg' }, { translateY: 3 }],
  },
});
