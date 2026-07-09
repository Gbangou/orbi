import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import type { Place } from '@orbi/api';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS = 600;
const OUAGA_VIEWBOX = '-1.7,12.2,-1.3,12.5';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    county?: string;
  };
}

function toPlace(result: NominatimResult): Place {
  const parts = result.display_name.split(', ');
  const label = parts[0] ?? result.display_name;
  const address = parts.slice(0, 3).join(', ');
  return {
    id: String(result.place_id),
    label,
    address,
    coordinates: {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    },
  };
}

function compactSuggestionLabel(label: string): string {
  const normalized = label.trim();
  const lower = normalized.toLowerCase();

  if (lower.includes('universite norbert zongo')) return 'Univ. N. Zongo';
  if (lower.includes('gare routiere de banfora')) return 'Gare Banfora';

  return normalized.length > 18 ? `${normalized.slice(0, 17).trim()}…` : normalized;
}

function CloseGlyph({ color }: { color: string }) {
  return (
    <View style={iconStyles.closeWrap}>
      <View style={[iconStyles.closeLine, iconStyles.closeLineA, { backgroundColor: color }]} />
      <View style={[iconStyles.closeLine, iconStyles.closeLineB, { backgroundColor: color }]} />
    </View>
  );
}

export interface PlaceSearchProps {
  placeholder: string;
  onSelectPlace: (place: Place) => void;
  tone?: 'teal' | 'sky' | 'amber';
  suggestions?: Place[];
  suggestionLabel?: string;
}

export function PlaceSearch({
  placeholder,
  onSelectPlace,
  tone = 'teal',
  suggestions = [],
  suggestionLabel = 'Suggestions',
}: PlaceSearchProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accentColor =
    tone === 'teal'
      ? theme.colors.teal
      : tone === 'sky'
        ? theme.colors.sky
        : theme.colors.amber;

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: `${q}, Ouagadougou`,
        format: 'json',
        limit: '5',
        countrycodes: 'bf',
        viewbox: OUAGA_VIEWBOX,
        bounded: '0',
        addressdetails: '1',
      });
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
        headers: { 'Accept-Language': 'fr', 'User-Agent': 'OrbiApp/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Recherche indisponible');
      const data: NominatimResult[] = await response.json();
      setResults(data.map(toPlace));
    } catch {
      setError('Recherche indisponible. Verifiez la connexion.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void search(text), DEBOUNCE_MS);
    },
    [search],
  );

  const handleSelect = useCallback(
    (place: Place) => {
      onSelectPlace(place);
      setQuery(place.address);
      setResults([]);
    },
    [onSelectPlace],
  );

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.inputRow,
          { borderColor: query.length > 0 ? accentColor : theme.colors.border },
        ]}
      >
        <TextInput
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
        />
        {isSearching ? (
          <ActivityIndicator size="small" color={accentColor} style={styles.spinner} />
        ) : query.length > 0 ? (
          <Pressable
            onPress={() => {
              setQuery('');
              setResults([]);
            }}
            style={styles.clearButton}
          >
            <CloseGlyph color={theme.colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      {results.length === 0 && suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsLabel}>{suggestionLabel}</Text>
          <View style={styles.suggestionsGrid}>
            {suggestions.slice(0, 4).map((place) => (
              <Pressable
                key={place.id}
                onPress={() => handleSelect(place)}
                style={({ pressed }) => [
                  styles.suggestionChip,
                  { borderColor: accentColor + '55' },
                  pressed ? styles.suggestionChipPressed : null,
                ]}
              >
                <Text style={styles.suggestionChipLabel} numberOfLines={1} ellipsizeMode="tail">
                  {compactSuggestionLabel(place.label)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {results.length > 0 ? (
        <View style={styles.resultsList}>
          {results.map((place) => (
            <Pressable
              key={place.id}
              onPress={() => handleSelect(place)}
              style={({ pressed }) => [
                styles.resultItem,
                pressed ? styles.resultItemPressed : null,
              ]}
            >
              <View
                style={[styles.resultDot, { backgroundColor: accentColor }]}
              />
              <View style={styles.resultText}>
                <Text style={styles.resultLabel} numberOfLines={1}>
                  {place.label}
                </Text>
                <Text style={styles.resultAddress} numberOfLines={1}>
                  {place.address}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  root: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  spinner: {
    marginLeft: 8,
  },
  clearButton: {
    marginLeft: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: theme.colors.rose ?? '#f87171',
    fontSize: 12,
    paddingHorizontal: 4,
  },
  suggestions: {
    gap: 7,
  },
  suggestionsLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    width: '46.5%',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  suggestionChipPressed: {
    backgroundColor: 'rgba(0,199,199,0.08)',
  },
  suggestionChipLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    width: '100%',
    flexShrink: 1,
    overflow: 'hidden',
  },
  resultsList: {
    backgroundColor: theme.colors.backgroundAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  resultItemPressed: {
    backgroundColor: 'rgba(0,199,199,0.08)',
  },
  resultDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  resultText: {
    flex: 1,
    gap: 1,
  },
  resultLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  resultAddress: {
    color: theme.colors.muted,
    fontSize: 11,
  },
});

const iconStyles = StyleSheet.create({
  closeWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLine: {
    position: 'absolute',
    width: 14,
    height: 2,
    borderRadius: 999,
  },
  closeLineA: {
    transform: [{ rotate: '45deg' }],
  },
  closeLineB: {
    transform: [{ rotate: '-45deg' }],
  },
});
