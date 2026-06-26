import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  createOrbiApiClient,
  resolveVoiceLocationIntentWithApi,
  type VoiceLocationIntentResponse,
} from "@orbi/api";
import { orbiTheme } from "@orbi/ui";
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from "@orbi/config";

// ── Sample prompts ────────────────────────────────────────────────────────────

const SAMPLES = [
  "Je vais à Ouaga 2000",
  "Université de Ouagadougou",
  "Zone du bois",
  "Aéroport de Ouaga",
] as const;

// ── Suggestion card ───────────────────────────────────────────────────────────

function SuggestionCard({
  name,
  address,
  district,
  confidence,
  onSelect,
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
        <View style={[styles.confBadge, { backgroundColor: isStrong ? "rgba(0,201,167,0.12)" : "rgba(255,149,0,0.12)" }]}>
          <Text style={[styles.confText, { color: isStrong ? orbiTheme.colors.teal : orbiTheme.colors.amber }]}>
            {pct}%
          </Text>
        </View>
        <Text style={styles.suggArrow}>›</Text>
      </View>
      <Text style={styles.suggName}>{name}</Text>
      <Text style={styles.suggMeta}>{district} · {address}</Text>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VoiceScreen() {
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<VoiceLocationIntentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const topSuggestion = useMemo(() => result?.suggestions[0] ?? null, [result]);

  const analyse = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
        version: orbiRuntimeConfig.apiVersion,
      });
      const response = await resolveVoiceLocationIntentWithApi(client, { transcript: trimmed });
      setResult(response);
    } catch {
      setErrorMsg("Service momentanément indisponible. Réessayez dans un instant.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleSelectSuggestion(suggestion: VoiceLocationIntentResponse["suggestions"][number]) {
    router.push({
      pathname: "/book",
      params: {
        suggestionName: suggestion.name,
        suggestionAddress: suggestion.address,
        suggestionLat: String(suggestion.latitude),
        suggestionLng: String(suggestion.longitude),
      },
    });
  }

  function handleSample(sample: string) {
    setTranscript(sample);
    void analyse(sample);
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Recherche vocale</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.micIcon}>
            <Text style={styles.micGlyph}>🎤</Text>
          </View>
          <Text style={styles.heroTitle}>Dites le lieu, Orbi trouve l'adresse</Text>
          <Text style={styles.heroSub}>
            Tapez une phrase en français — le moteur comprend les noms de quartiers,
            monuments et zones de Ouagadougou.
          </Text>
        </View>

        {/* Input */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Votre destination</Text>
          <TextInput
            ref={inputRef}
            value={transcript}
            onChangeText={setTranscript}
            placeholder="Ex : Je vais à Ouaga 2000"
            placeholderTextColor={orbiTheme.colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void analyse(transcript)}
            autoCorrect={false}
            multiline={false}
          />
          <Pressable
            onPress={() => void analyse(transcript)}
            disabled={isLoading || !transcript.trim()}
            style={({ pressed }) => [
              styles.analyseBtn,
              (isLoading || !transcript.trim()) && styles.analyseBtnDisabled,
              pressed && styles.analyseBtnPressed,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.analyseBtnLabel}>Analyser</Text>
            )}
          </Pressable>
        </View>

        {/* Sample prompts */}
        <View style={styles.samplesSection}>
          <Text style={styles.samplesLabel}>Essayez avec</Text>
          <View style={styles.samplesRow}>
            {SAMPLES.map((sample) => (
              <Pressable
                key={sample}
                onPress={() => handleSample(sample)}
                style={({ pressed }) => [styles.sampleChip, pressed && styles.sampleChipPressed]}
              >
                <Text style={styles.sampleChipText}>{sample}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Error */}
        {errorMsg ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Results */}
        {result ? (
          <>
            {/* Confidence summary */}
            <View style={styles.resultSummary}>
              <View style={styles.resultBadge}>
                <View style={[
                  styles.resultDot,
                  { backgroundColor: result.needsClarification ? orbiTheme.colors.amber : orbiTheme.colors.teal },
                ]} />
                <Text style={[
                  styles.resultBadgeText,
                  { color: result.needsClarification ? orbiTheme.colors.amber : orbiTheme.colors.teal },
                ]}>
                  {result.needsClarification ? "Clarification utile" : "Résultat exploitable"}
                </Text>
              </View>
              <Text style={styles.resultInterpretation}>{result.interpretation}</Text>
            </View>

            {/* Suggestions */}
            {result.suggestions.length > 0 ? (
              <View style={styles.suggsSection}>
                <Text style={styles.suggsTitle}>
                  {result.suggestions.length} lieu{result.suggestions.length > 1 ? "x" : ""} trouvé{result.suggestions.length > 1 ? "s" : ""}
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
            ) : (
              <View style={styles.emptyResult}>
                <Text style={styles.emptyTitle}>Aucun lieu identifié</Text>
                <Text style={styles.emptyMeta}>
                  Essayez d'être plus précis : "Marché central de Ouaga" ou "Quartier Patte d'Oie".
                </Text>
              </View>
            )}
          </>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: orbiTheme.colors.background },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  backArrow: { fontSize: 28, color: orbiTheme.colors.text, marginTop: -2 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: orbiTheme.colors.text,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 20,
  },

  // Hero
  hero: { alignItems: "center", gap: 12, paddingHorizontal: 8 },
  micIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,201,167,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  micGlyph: { fontSize: 32 },
  heroTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: orbiTheme.colors.text,
    textAlign: "center",
    lineHeight: 26,
  },
  heroSub: {
    fontSize: 14,
    color: orbiTheme.colors.textMuted,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  // Input card
  inputCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 16,
    gap: 12,
    ...orbiTheme.shadows.card,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: orbiTheme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: orbiTheme.colors.text,
  },
  analyseBtn: {
    backgroundColor: orbiTheme.colors.text,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    ...orbiTheme.shadows.button,
  },
  analyseBtnDisabled: { opacity: 0.38 },
  analyseBtnPressed: { opacity: 0.85 },
  analyseBtnLabel: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },

  // Samples
  samplesSection: { gap: 10 },
  samplesLabel: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    color: orbiTheme.colors.textMuted,
  },
  samplesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sampleChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  sampleChipPressed: { opacity: 0.75 },
  sampleChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: orbiTheme.colors.textSoft,
  },

  // Error
  errorCard: {
    backgroundColor: "rgba(255,59,48,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.22)",
    borderRadius: 12,
    padding: 14,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: orbiTheme.colors.danger,
    lineHeight: 18,
  },

  // Result summary
  resultSummary: {
    gap: 8,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 14,
  },
  resultBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultDot: { width: 7, height: 7, borderRadius: 4 },
  resultBadgeText: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
  resultInterpretation: {
    fontSize: 14,
    color: orbiTheme.colors.textSoft,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },

  // Suggestions
  suggsSection: { gap: 10 },
  suggsTitle: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: orbiTheme.colors.text,
  },
  suggCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    padding: 14,
    gap: 6,
    ...orbiTheme.shadows.card,
  },
  suggCardPressed: { opacity: 0.82 },
  suggHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  confBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confText: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  suggArrow: { fontSize: 22, color: orbiTheme.colors.teal },
  suggName: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  suggMeta: { fontSize: 12, color: orbiTheme.colors.textMuted, fontFamily: "Inter_400Regular" },

  // Empty
  emptyResult: { alignItems: "center", paddingVertical: 24, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  emptyMeta: {
    fontSize: 13,
    color: orbiTheme.colors.textMuted,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },
});
