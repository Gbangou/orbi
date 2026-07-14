import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  children: React.ReactNode;
  fallbackLabel?: string;
  fallbackDetail?: string;
  // Rendu a la place de l'ecran de secours plein ecran par defaut, pour les
  // cas ou l'erreur doit degrader une seule zone (ex: une carte WebView) sans
  // remplacer tout l'ecran par un message generique.
  fallback?: React.ReactNode;
  onError?: (error: unknown, info: React.ErrorInfo) => void;
};

type State = {
  hasError: boolean;
};

const defaultFallbackDetail =
  "L'incident a ete signale automatiquement. Reessayez dans un instant.";

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    // Le detail technique de l'erreur ne doit jamais atteindre l'ecran utilisateur
    // (fuite d'infos internes) : seul componentDidCatch le transmet au signalement.
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ErrorBoundary]', error, info.componentStack);
    }

    try {
      this.props.onError?.(error, info);
    } catch {
      // Le signalement ne doit jamais empecher l'affichage de l'ecran de secours.
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
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
});
