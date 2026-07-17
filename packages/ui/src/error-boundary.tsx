import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  children: React.ReactNode;
  fallbackLabel?: string;
  fallbackDetail?: string;
  // Rendu a la place de l'ecran de secours plein ecran par defaut, pour les
  // cas ou l'erreur doit degrader une seule zone (ex: une carte WebView) sans
  // remplacer tout l'ecran par un message generique.
  fallback?: React.ReactNode;
  onError?: (error: unknown, info: React.ErrorInfo) => void;
  // Diagnostic uniquement: affiche le message et la stack reels a l'ecran au
  // lieu du message generique. Ne jamais activer en production normale -
  // reserve a un build de debug ponctuel pour identifier un crash terrain.
  showDebugDetails?: boolean;
};

type State = {
  hasError: boolean;
  debugMessage: string | null;
  debugStack: string | null;
};

const defaultFallbackDetail =
  "L'incident a ete signale automatiquement. Reessayez dans un instant.";

function shouldShowDebugDetails(enabled: boolean | undefined) {
  return Boolean(enabled && typeof __DEV__ !== 'undefined' && __DEV__);
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, debugMessage: null, debugStack: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    // Le detail technique de l'erreur ne doit jamais atteindre l'ecran utilisateur
    // (fuite d'infos internes) : seul componentDidCatch le transmet au signalement.
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ErrorBoundary]', error, info.componentStack);
    }

    if (shouldShowDebugDetails(this.props.showDebugDetails)) {
      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      this.setState({
        debugMessage: message,
        debugStack:
          (error instanceof Error ? error.stack : undefined) ??
          info.componentStack ??
          null,
      });
    }

    try {
      this.props.onError?.(error, info);
    } catch {
      // Le signalement ne doit jamais empecher l'affichage de l'ecran de secours.
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, debugMessage: null, debugStack: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠</Text>
          <Text style={styles.title}>
            {this.props.fallbackLabel ?? 'Quelque chose s\'est mal passé'}
          </Text>
          <Text style={styles.detail} numberOfLines={3}>
            {this.props.fallbackDetail ?? defaultFallbackDetail}
          </Text>
          <Pressable
            onPress={this.handleRetry}
            style={({ pressed }: { pressed: boolean }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnLabel}>Réessayer</Text>
          </Pressable>
          {shouldShowDebugDetails(this.props.showDebugDetails) &&
          this.state.debugMessage ? (
            <ScrollView style={styles.debugBox}>
              <Text selectable style={styles.debugText}>
                {this.state.debugMessage}
                {'\n\n'}
                {this.state.debugStack ?? ''}
              </Text>
            </ScrollView>
          ) : null}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  icon: { fontSize: 40, color: '#FF9500' },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  detail: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 18,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  btnPressed: { opacity: 0.8 },
  btnLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  debugBox: {
    marginTop: 16,
    maxHeight: 280,
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 12,
  },
  debugText: {
    color: '#FF9500',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
