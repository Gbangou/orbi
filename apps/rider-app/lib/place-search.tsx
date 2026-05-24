import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { orbiTheme } from '@orbi/ui';
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

export interface PlaceSearchProps {
  placeholder: string;
  onSelectPlace: (place: Place) => void;
  tone?: 'teal' | 'sky' | 'amber';
}

export function PlaceSearch({
  placeholder,
  onSelectPlace,
  tone = 'teal',
}: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accentColor =
    tone === 'teal'
      ? orbiTheme.colors.teal
      : tone === 'sky'
        ? orbiTheme.colors.sky
        : orbiTheme.colors.amber;

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
          { borderColor: query.length > 0 ? accentColor : orbiTheme.colors.border },
        ]}
      >
        <TextInput
          value={query}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={orbiTheme.colors.muted}
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
            <Text style={[styles.clearLabel, { color: orbiTheme.colors.muted }]}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
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

const styles = StyleSheet.create({
  root: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  input: {
    flex: 1,
    color: orbiTheme.colors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  spinner: {
    marginLeft: 8,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  clearLabel: {
    fontSize: 14,
  },
  error: {
    color: orbiTheme.colors.rose ?? '#f87171',
    fontSize: 12,
    paddingHorizontal: 4,
  },
  resultsList: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: orbiTheme.colors.border,
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
    color: orbiTheme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  resultAddress: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
  },
});
