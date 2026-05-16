import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createOrbiApiClient,
  extractApiErrorMessage,
  fetchMyTrips,
  resolveVoiceLocationIntentWithApi,
  type MyTripsResponse,
  type VoiceLocationIntentResponse,
} from "@orbi/api";
import { orbiCopy, orbiTheme } from "@orbi/ui";
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from "@orbi/config";
import { restoreRiderSession } from "../lib/auth";
import { resolveRiderAppError } from "../lib/session-feedback";
import {
  buildRiderFlowTransitionLabel,
  buildRiderPeripheralStatusLabel,
  resolveRiderActiveFlow,
} from "../lib/rider-active-flow";
import {
  DashboardMetricCard,
  FlowActionButton,
  InsightBadge,
  LiveStatusBanner,
  QuickActionCard,
  RouteSignalCard,
  SectionCard,
  SectionHeading,
} from "../lib/realtime-widgets";
import { RiderJourneySection } from "../lib/rider-journey";
import { useLiveRefresh } from "../lib/use-live-refresh";

const SAMPLE_TRANSCRIPTS = [
  "Je vais a Ouaga 2000",
  "Viens me chercher a l universite de Ouaga",
  "Je suis a la zone du bois",
] as const;

export default function VoiceScreen() {
  const [transcript, setTranscript] = useState<string>(SAMPLE_TRANSCRIPTS[0]);
  const [result, setResult] = useState<VoiceLocationIntentResponse | null>(
    null,
  );
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [status, setStatus] = useState("Analyse vocale en cours...");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceTransitionLabel, setVoiceTransitionLabel] = useState<
    string | null
  >(null);
  const previousFlowStateRef = useRef<string | null>(null);

  useEffect(() => {
    void loadVoiceContext();
    void resolveTranscript(SAMPLE_TRANSCRIPTS[0]);
  }, []);

  useLiveRefresh(() => loadVoiceContext(true), 45000);

  const topSuggestion = useMemo(() => result?.suggestions[0] ?? null, [result]);
  const flow = resolveRiderActiveFlow(history);

  useEffect(() => {
    const previousFlowState = previousFlowStateRef.current;
    setVoiceTransitionLabel(
      buildRiderFlowTransitionLabel(
        previousFlowState,
        flow.activeFlowState,
        "voice",
      ),
    );

    previousFlowStateRef.current = flow.activeFlowState;
  }, [flow.activeFlowState]);

  useEffect(() => {
    if (!voiceTransitionLabel) {
      return;
    }

    const timeout = setTimeout(() => {
      setVoiceTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [voiceTransitionLabel]);

  async function loadVoiceContext(silent = false) {
    try {
      const { authClient } = await restoreRiderSession();
      const historyResponse = await fetchMyTrips(authClient);
      setHistory(historyResponse);

      if (!silent && !result) {
        const nextFlow = resolveRiderActiveFlow(historyResponse);
        setStatus(
          buildRiderPeripheralStatusLabel({
            flow: nextFlow,
            surface: "voice",
          }),
        );
      }
    } catch (error) {
      if (!silent) {
        const feedback = await resolveRiderAppError(error, {
          fallback: "Le contexte rider n a pas pu etre charge pour la voix.",
        });
        setStatus(feedback.message);
      }
    }
  }

  async function resolveTranscript(nextTranscript: string) {
    const client = createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
      version: orbiRuntimeConfig.apiVersion,
    });

    if (!nextTranscript.trim()) {
      setStatus("Saisissez ou dictez une commande avant de lancer l analyse.");
      setResult(null);
      return;
    }

    setIsLoading(true);
    setStatus("Analyse vocale du lieu en cours...");

    try {
      const response = await resolveVoiceLocationIntentWithApi(client, {
        transcript: nextTranscript,
      });

      setResult(response);
      setStatus(
        response.needsClarification
          ? "La commande a besoin d une clarification avant de reserver."
          : flow.hasOpenFlow
            ? `Intention ${response.intentType} detectee avec succes. Flux rider ${flow.primaryStatusLabel}.`
            : `Intention ${response.intentType} detectee avec succes.`,
      );
    } catch (error) {
      setStatus(
        extractApiErrorMessage(
          error,
          "Le service vocal backend est indisponible. Mode local a verifier.",
        ),
      );
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Recherche vocale</Text>
      <Text style={styles.body}>{orbiCopy.voiceHeadline}</Text>
      <LiveStatusBanner
        label="Voice live"
        message={status}
        secondaryMessage={
          voiceTransitionLabel
            ? voiceTransitionLabel
            : flow.primaryRouteLabel
              ? `Flux actif rattache: ${flow.primaryRouteLabel}.`
              : "Le moteur vocal interprete une demande libre puis propose des lieux exploitables dans le contexte Burkina Faso."
        }
      />

      <SectionCard tone="sky">
        <SectionHeading
          eyebrow="Vue rapide"
          title="Recherche de lieu par la voix"
          description="Combinez une phrase libre, des exemples frequents et une interpretation structuree pour aller plus vite vers la reservation."
        />
        <View style={styles.insightRow}>
          <InsightBadge
            label="Locale"
            value={result?.locale ?? "fr-BF"}
            tone="sky"
          />
          <InsightBadge
            label="Flux actif"
            value={flow.primaryStatusLabel}
            tone={flow.hasOpenFlow ? "amber" : "teal"}
          />
          <InsightBadge
            label="Confiance"
            value={`${Math.round((result?.confidence ?? 0) * 100)}%`}
            tone={result?.needsClarification ? "amber" : "teal"}
          />
          <InsightBadge
            label="Etat"
            value={result?.needsClarification ? "Clarifier" : "Exploitable"}
            tone={result?.needsClarification ? "amber" : "teal"}
          />
        </View>
      </SectionCard>

      <RiderJourneySection
        currentStep="voice"
        description="La voix n est plus une branche isolee. Elle fait partie du meme tunnel rider que l accueil, la reservation et le suivi."
      />

      <View style={styles.voiceCard}>
        <Text style={styles.label}>Commande vocale a interpreter</Text>
        {flow.hasOpenFlow ? (
          <Text style={styles.flowMeta}>
            Reservation active: {flow.primaryStatusLabel}
            {flow.primaryRouteLabel ? ` - ${flow.primaryRouteLabel}` : ""}
          </Text>
        ) : null}
        <TextInput
          value={transcript}
          onChangeText={setTranscript}
          placeholder="Ex: Je vais a Ouaga 2000"
          placeholderTextColor={orbiTheme.colors.muted}
          style={styles.input}
        />
        <View style={styles.sampleRow}>
          {SAMPLE_TRANSCRIPTS.map((sample) => (
            <QuickActionCard
              key={sample}
              title={sample}
              description="Relancer cette phrase exemple"
              onPress={() => {
                setTranscript(sample);
                void resolveTranscript(sample);
              }}
              tone="sky"
            />
          ))}
        </View>
        <FlowActionButton
          onPress={() => void resolveTranscript(transcript)}
          disabled={isLoading}
          label={isLoading ? "Analyse..." : "Analyser la commande"}
          tone="teal"
          emphasis="primary"
          style={isLoading ? styles.buttonDisabled : null}
        />
      </View>

      <View style={styles.metricsRow}>
        <DashboardMetricCard
          label="Langue"
          value={result?.locale ?? "fr-BF"}
          helper="priorite MVP Burkina Faso"
          tone="sky"
        />
        <DashboardMetricCard
          label="Confiance"
          value={`${Math.round((result?.confidence ?? 0) * 100)}%`}
          helper={
            result?.needsClarification
              ? "clarification requise"
              : "intention exploitable"
          }
          tone={result?.needsClarification ? "amber" : "teal"}
        />
        <DashboardMetricCard
          label="Suggestions"
          value={String(result?.suggestions.length ?? 0)}
          helper="lieux compris par la voix"
          tone="sky"
        />
      </View>

      {result ? (
        <RouteSignalCard
          eyebrow="Interpretation"
          badgeLabel={
            result.needsClarification ? "Clarification" : "Exploitable"
          }
          badgeTone={result.needsClarification ? "amber" : "teal"}
          title={result.interpretation}
          description={`Transcription normalisee: ${result.normalizedTranscript}`}
          insights={[
            {
              label: "Intent",
              value: result.intentType,
              tone: result.needsClarification ? "amber" : "teal",
            },
            {
              label: "Confiance",
              value: `${Math.round(result.confidence * 100)}%`,
              tone: result.needsClarification ? "amber" : "sky",
            },
          ]}
          note={
            topSuggestion
              ? `Meilleur lieu: ${topSuggestion.name}, ${topSuggestion.district}`
              : null
          }
          noteTone="teal"
        />
      ) : null}

      <Text style={styles.section}>Lieux compris par la voix</Text>
      {(result?.suggestions ?? []).map((item) => (
        <RouteSignalCard
          key={`${item.name}-${item.district}`}
          eyebrow="Suggestion vocale"
          badgeLabel={`${Math.round(item.confidence * 100)}%`}
          badgeTone={item.confidence >= 0.75 ? "teal" : "amber"}
          title={item.name}
          description={item.address}
          insights={[
            { label: "Quartier", value: item.district, tone: "sky" },
            {
              label: "Confiance",
              value: `${Math.round(item.confidence * 100)}%`,
              tone: item.confidence >= 0.75 ? "teal" : "amber",
            },
          ]}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: orbiTheme.colors.background,
    gap: 16,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    fontWeight: "800",
  },
  body: {
    color: orbiTheme.colors.muted,
    lineHeight: 22,
  },
  insightRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  voiceCard: {
    backgroundColor: orbiTheme.colors.panel,
    borderColor: orbiTheme.colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  label: {
    color: orbiTheme.colors.teal,
    textTransform: "uppercase",
    fontSize: 12,
  },
  flowMeta: {
    color: orbiTheme.colors.text,
    fontWeight: "700",
    lineHeight: 20,
  },
  input: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: orbiTheme.colors.text,
    fontSize: 16,
  },
  sampleRow: {
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  section: {
    color: orbiTheme.colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
});
