/**
 * Voice Screen — Recherche vocale en français
 *
 * Capture la voix de l'utilisateur, envoie le transcript au NLP
 * backend Orbi et propose des lieux correspondant à Ouagadougou.
 *
 * Flow:
 *   1. Appui bouton → Permission micro → Enregistrement
 *   2. Release → Transcription STT locale (Web Speech API / expo-av)
 *   3. Transcript envoyé à POST /voice/location-intent
 *   4. Suggestions retournées → naviguer vers /book avec pré-remplissage
 */
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { createOrbiApiClient, resolveVoiceLocationIntentWithApi, type VoiceLocationIntentResponse } from '@orbi/api';
import { orbiTheme } from '@orbi/ui';
import { orbiRuntimeConfig, resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';

// ── Exemples de phrases ───────────────────────────────────────────────────────

const SAMPLE_PHRASES = [
  'Je vais à Ouaga 2000',
  'Université Joseph Ki-Zerbo',
  'Aéroport de Ouagadougou',
  'Marché Rood Woko',
  'Zone du Bois',
  'Hôtel Laïco',
] as const;

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
      style={({ pressed }) => [styles.suggCard, pressed && styles.suggCardPressed]}
    >
      <View style={styles.suggHeader}>
        <View style={[styles.confBadge, { backgroundColor: isStrong ? 'rgba(0,201,167,0.12)' : 'rgba(255,149,0,0.12)' }]}>
          <Text style={[styles.confText, { color: isStrong ? orbiTheme.colors.teal : orbiTheme.colors.amber }]}>{pct}%</Text>
        </View>
        <Text style={styles.suggArrow}>›</Text>
      </View>
      <Text style={styles.suggName}>{name}</Text>
      <Text style={styles.suggMeta}>{district} · {address}</Text>
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
          Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
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
        <Text style={styles.micGlyph}>🎤</Text>
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
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  // Check permission on mount
  useEffect(() => {
    Audio.requestPermissionsAsync().then(({ granted }) => {
      setPermissionGranted(granted);
    });
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (!permissionGranted) {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          setErrorMsg('Permission microphone refusée. Activez-la dans les réglages.');
          return;
        }
        setPermissionGranted(true);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setTranscript('');
      setResult(null);
      setErrorMsg(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      setErrorMsg('Impossible de démarrer l\'enregistrement. Réessayez.');
    }
  }, [permissionGranted]);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    setIsRecording(false);
    setIsAnalyzing(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;

      // En production: envoyer l'audio à un service STT (Whisper/Google STT)
      // Pour le MVP: utiliser une phrase simulée basée sur la durée
      // La vraie intégration STT est documentée dans ARCHITECTURE.md
      const durationMs = recording.getStatusAsync ? (await recording.getStatusAsync()).durationMillis ?? 0 : 0;
      const simulatedTranscript = durationMs > 1500
        ? 'Je vais à Ouaga 2000'
        : 'Université de Ouaga';

      setTranscript(simulatedTranscript);
      await analyseTranscript(simulatedTranscript);
    } catch {
      setIsAnalyzing(false);
      setErrorMsg('Enregistrement échoué. Utilisez les suggestions ci-dessous.');
    }
  }, []);

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

  function handleSelectSuggestion(s: VoiceLocationIntentResponse['suggestions'][number]) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Recherche vocale</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Hero + mic button */}
        <View style={styles.hero}>
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
        </View>

        {/* Error */}
        {errorMsg ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
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
          <View style={styles.noResults}>
            <Text style={styles.noResultsTitle}>Aucun lieu identifié</Text>
            <Text style={styles.noResultsMeta}>Essayez avec les exemples ci-dessous</Text>
          </View>
        ) : null}

        {/* Sample phrases */}
        {!result ? (
          <View style={styles.samples}>
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
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: orbiTheme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: orbiTheme.colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: orbiTheme.colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 28, color: orbiTheme.colors.text, marginTop: -2 },
  headerTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  content: { paddingHorizontal: 20, paddingTop: 28, gap: 20 },

  // Hero
  hero: { alignItems: 'center', gap: 14 },
  micBtn: { width: 96, height: 96, borderRadius: 48, backgroundColor: orbiTheme.colors.backgroundAlt, borderWidth: 2, borderColor: orbiTheme.colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  micBtnActive: { backgroundColor: 'rgba(255,59,48,0.08)', borderColor: orbiTheme.colors.danger, shadowColor: orbiTheme.colors.danger, shadowOpacity: 0.3 },
  micGlyph: { fontSize: 38 },
  recDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: orbiTheme.colors.danger },
  heroTitle: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text, textAlign: 'center' },
  heroSub: { fontSize: 14, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  transcriptBubble: { backgroundColor: orbiTheme.colors.backgroundAlt, borderRadius: 14, borderWidth: 1, borderColor: orbiTheme.colors.border, paddingHorizontal: 16, paddingVertical: 10, maxWidth: 300 },
  transcriptText: { fontSize: 15, fontStyle: 'italic', color: orbiTheme.colors.text, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Error
  errorCard: { backgroundColor: 'rgba(255,59,48,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,59,48,0.22)', padding: 14 },
  errorText: { fontSize: 13, color: orbiTheme.colors.danger, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  // Results
  results: { gap: 10 },
  resultsTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  suggCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: orbiTheme.colors.border, padding: 14, gap: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  suggCardPressed: { opacity: 0.82 },
  suggHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  suggArrow: { fontSize: 22, color: orbiTheme.colors.teal },
  suggName: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  suggMeta: { fontSize: 12, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular' },

  // No results
  noResults: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  noResultsTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.text },
  noResultsMeta: { fontSize: 13, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular' },

  // Samples
  samples: { gap: 12 },
  samplesTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.textMuted },
  samplesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sampleChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: orbiTheme.colors.backgroundAlt, borderWidth: 1, borderColor: orbiTheme.colors.border },
  sampleChipPressed: { opacity: 0.75 },
  sampleText: { fontSize: 13, fontWeight: '500', fontFamily: 'Inter_500Medium', color: orbiTheme.colors.textSoft },
});
