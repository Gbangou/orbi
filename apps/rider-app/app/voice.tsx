/**
 * Voice Screen — Recherche intelligente en français
 *
 * Le moteur STT natif a été retiré du build production: la librairie disponible
 * apporte une chaîne Expo obsolète et vulnérable. On conserve le parcours
 * destination intelligente via texte/suggestions et le backend d'intention.
 */
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { resolveVoiceLocationIntentWithApi, type VoiceLocationIntentResponse } from '@orbi/api';
import type { OrbiTheme } from '@orbi/ui';
import { OrbiScreen, OrbiStatusBanner, OrbiSurface, safeHaptics, useOrbiTheme } from '@orbi/ui/native';
import { createRiderPublicClient } from '../lib/auth';
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from '../lib/privacy/screen-capture';

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
  const theme = useOrbiTheme();
  const voiceIcon = useMemo(() => makeVoiceIconStyles(theme), [theme]);
  return (
    <View style={voiceIcon.backWrap}>
      <View style={[voiceIcon.backLine, voiceIcon.backLineTop]} />
      <View style={[voiceIcon.backLine, voiceIcon.backLineBottom]} />
    </View>
  );
}

function ForwardGlyph() {
  const theme = useOrbiTheme();
  const voiceIcon = useMemo(() => makeVoiceIconStyles(theme), [theme]);
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
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
            <Text style={[styles.confText, { color: isStrong ? theme.colors.teal : theme.colors.amber }]}>{pct}%</Text>
          </View>
          <ForwardGlyph />
        </View>
        <Text style={styles.suggName}>{name}</Text>
        <Text style={styles.suggMeta}>{district} · {address}</Text>
      </OrbiSurface>
    </Pressable>
  );
});

// ── Action button ─────────────────────────────────────────────────────────────

const AnalyzeButton = memo(function AnalyzeButton({
  disabled,
  isAnalyzing,
  onPress,
}: {
  disabled: boolean;
  isAnalyzing: boolean;
  onPress: () => void;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <View
        style={[
          styles.analyzeBtn,
          disabled && styles.analyzeBtnDisabled,
        ]}
      >
        <Text style={styles.analyzeBtnText}>
          {isAnalyzing ? 'Analyse...' : 'Trouver le lieu'}
        </Text>
      </View>
    </Pressable>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VoiceScreen() {
  const router = useRouter();
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<VoiceLocationIntentResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    preventSensitiveScreenCapture();
    return () => {
      restoreSensitiveScreenCapture();
    };
  }, []);

  const analyseTranscript = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const client = createRiderPublicClient();
      const response = await resolveVoiceLocationIntentWithApi(client, { transcript: text.trim() });
      setResult(response);
    } catch {
      setErrorMsg('Service vocal indisponible. Réessayez dans un instant.');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const submitTranscript = useCallback(() => {
    safeHaptics.impact('medium');
    setResult(null);
    void analyseTranscript(transcript);
  }, [analyseTranscript, transcript]);

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

        {/* Hero + intent input */}
        <OrbiSurface tone={isAnalyzing ? 'sky' : 'teal'} style={styles.hero} elevated>
          <Text style={styles.heroTitle}>
            {isAnalyzing ? 'Analyse en cours...' : 'Où allez-vous ?'}
          </Text>
          <Text style={styles.heroSub}>
            Tapez une destination en français. Ex: "Je vais à Ouaga 2000"
          </Text>
          <TextInput
            value={transcript}
            onChangeText={(text) => {
              setTranscript(text);
              setErrorMsg(null);
            }}
            placeholder="Ex: Université Joseph Ki-Zerbo"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.intentInput}
            returnKeyType="search"
            onSubmitEditing={submitTranscript}
          />
          <AnalyzeButton
            disabled={!transcript.trim() || isAnalyzing}
            isAnalyzing={isAnalyzing}
            onPress={submitTranscript}
          />
        </OrbiSurface>

        {/* Error */}
        {errorMsg ? (
          <OrbiStatusBanner
            title="Recherche indisponible"
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

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  content: { paddingHorizontal: 20, paddingTop: 28, gap: 20 },

  // Hero
  hero: { alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 24 },
  intentInput: {
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundAlt,
    color: theme.colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  analyzeBtn: {
    minHeight: 46,
    width: '100%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.teal,
  },
  analyzeBtnDisabled: {
    opacity: 0.45,
  },
  analyzeBtnText: {
    color: theme.colors.background,
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
  },
  micBtn: { width: 96, height: 96, borderRadius: 48, backgroundColor: theme.colors.backgroundAlt, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  micBtnActive: { backgroundColor: 'rgba(255,59,48,0.08)', borderColor: theme.colors.danger, shadowColor: theme.colors.danger, shadowOpacity: 0.3 },
  micGlyph: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  micHead: { width: 22, height: 28, borderRadius: 11, backgroundColor: theme.colors.text },
  micStem: { width: 4, height: 10, backgroundColor: theme.colors.text, marginTop: 2, borderRadius: 2 },
  micBase: { width: 24, height: 4, backgroundColor: theme.colors.text, borderRadius: 2, marginTop: 2 },
  recDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.danger },
  heroTitle: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text, textAlign: 'center' },
  heroSub: { fontSize: 14, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  transcriptBubble: { backgroundColor: theme.colors.backgroundAlt, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 10, maxWidth: 300 },
  transcriptText: { fontSize: 15, fontStyle: 'italic', color: theme.colors.text, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Results
  results: { gap: 10 },
  resultsTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  suggCard: { padding: 14, gap: 6 },
  suggCardPressed: { opacity: 0.82 },
  suggHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  suggName: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  suggMeta: { fontSize: 12, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular' },

  // No results
  noResults: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 20, gap: 6 },
  noResultsTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold', color: theme.colors.text },
  noResultsMeta: { fontSize: 13, color: theme.colors.textMuted, fontFamily: 'Inter_400Regular' },

  // Samples
  samples: { gap: 12, padding: 14 },
  samplesTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: theme.colors.textMuted },
  samplesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sampleChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: theme.colors.backgroundAlt, borderWidth: 1, borderColor: theme.colors.border },
  sampleChipPressed: { opacity: 0.75 },
  sampleText: { fontSize: 13, fontWeight: '500', fontFamily: 'Inter_500Medium', color: theme.colors.textSoft },
});

const makeVoiceIconStyles = (theme: OrbiTheme) => StyleSheet.create({
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
    backgroundColor: theme.colors.text,
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
    backgroundColor: theme.colors.teal,
    right: 3,
  },
  forwardLineTop: {
    transform: [{ rotate: '45deg' }, { translateY: -3 }],
  },
  forwardLineBottom: {
    transform: [{ rotate: '-45deg' }, { translateY: 3 }],
  },
});
