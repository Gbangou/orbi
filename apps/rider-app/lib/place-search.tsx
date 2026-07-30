import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { burkinaPricingCityPresets, type Place } from '@orbi/api';
import { normalizeMapCoordinatePair } from './map-coordinate';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS = 600;
const MIN_LOCAL_QUERY_LENGTH = 1;
const BURKINA_VIEWBOX = '-5.6,9.3,2.6,15.2';
const CITY_VIEWBOXES: Record<string, string> = {
  OUAGADOUGOU: '-1.7,12.2,-1.3,12.5',
  'BOBO-DIOULASSO': '-4.5,11.0,-4.15,11.35',
  BOBO_DIOULASSO: '-4.5,11.0,-4.15,11.35',
  KOUDOUGOU: '-2.5,12.1,-2.25,12.35',
  BANFORA: '-4.9,10.55,-4.65,10.75',
  OUAHIGOUYA: '-2.55,13.45,-2.25,13.7',
};

const PLACE_ALIASES: Record<string, string[]> = {
  'ouaga-tampuy': ['tampui', 'tampoui', 'tampouy', 'tam pouy', 'tampouy ouaga'],
  'ouaga-nioko-ii': ['nioko 2', 'nioko deux', 'nioko ii', 'niongo', 'nyoko'],
  'ouaga-nong-warbin': ['nong warbin', 'nongwarbin', 'nong warbain', 'nong warbine'],
  'ouaga-dassasgho': ['dassasgo', 'dassasgo ouaga', 'dasasgho', 'dassasgho'],
  'ouaga-patte-doie': [
    'patte d oie',
    'pate doie',
    'pate d oie',
    'pat doie',
    'patte doie',
    'patte d oie ouaga',
  ],
  'ouaga-gounghin': ['goungin', 'gounghin ouaga', 'gounghin'],
  'ouaga-zogona': ['zogna', 'zogonna', 'zogona ouaga'],
  'ouaga-koulouba': ['kuluba', 'kouluba', 'koulouba ouaga'],
  'ouaga-zone-du-bois': ['zone bois', 'zdb', 'zone de bois', 'zone du boi'],
  'ouaga-somgande': ['somgande', 'somgandé', 'somgandé ouaga', 'somgande ouaga'],
  'ouaga-pissy': ['pissi', 'pissy ouaga'],
  'ouaga-kilwin': ['kilwin', 'kilouin', 'kilwin ouaga'],
  'ouaga-saaba': ['saba', 'saaba ouaga'],
  'ouaga-aeroport': ['aeroport', 'airport', 'aéroport', 'aeroport ouaga'],
  'ouaga-2000': ['ouaga deux mille', 'ouaga 2000', 'zone ouaga 2000'],
  'ouaga-universite-joseph-ki-zerbo': [
    'universite',
    'u jkz',
    'ujkz',
    'joseph ki zerbo',
    'ki zerbo',
  ],
  'bobo-gare-routiere': ['gare bobo', 'gare routiere bobo', 'gare routiere'],
  'bobo-sarfalao': ['sarfalao', 'sarfalao bobo'],
};

const LOCAL_BURKINA_PLACES: Place[] = [
  ...burkinaPricingCityPresets.flatMap((city) => [city.pickup, city.destination]),
  {
    id: 'ouaga-tampuy',
    label: 'Tampuy',
    address: 'Tampuy, Ouagadougou',
    district: 'Tampuy',
    coordinates: { latitude: 12.3988, longitude: -1.5552 },
  },
  {
    id: 'ouaga-nioko-ii',
    label: 'Nioko II',
    address: 'Nioko II, Rue 25.02, Nong-Warbin, Ouagadougou',
    district: 'Nong-Warbin',
    coordinates: { latitude: 12.4018, longitude: -1.4778 },
  },
  {
    id: 'ouaga-nong-warbin',
    label: 'Nong-Warbin',
    address: 'Nong-Warbin, Ouagadougou',
    district: 'Nong-Warbin',
    coordinates: { latitude: 12.3977, longitude: -1.4856 },
  },
  {
    id: 'ouaga-dassasgho',
    label: 'Dassasgho',
    address: 'Dassasgho, Ouagadougou',
    district: 'Dassasgho',
    coordinates: { latitude: 12.3827, longitude: -1.4939 },
  },
  {
    id: 'ouaga-patte-doie',
    label: "Patte d Oie",
    address: "Patte d Oie, Ouagadougou",
    district: "Patte d Oie",
    coordinates: { latitude: 12.334, longitude: -1.537 },
  },
  {
    id: 'ouaga-gounghin',
    label: 'Gounghin',
    address: 'Gounghin, Ouagadougou',
    district: 'Gounghin',
    coordinates: { latitude: 12.362, longitude: -1.533 },
  },
  {
    id: 'ouaga-zogona',
    label: 'Zogona',
    address: 'Zogona, Ouagadougou',
    district: 'Zogona',
    coordinates: { latitude: 12.371, longitude: -1.503 },
  },
  {
    id: 'ouaga-koulouba',
    label: 'Koulouba',
    address: 'Koulouba, Ouagadougou',
    district: 'Koulouba',
    coordinates: { latitude: 12.3716, longitude: -1.5235 },
  },
  {
    id: 'ouaga-zone-du-bois',
    label: 'Zone du Bois',
    address: 'Zone du Bois, Ouagadougou',
    district: 'Zone du Bois',
    coordinates: { latitude: 12.382, longitude: -1.509 },
  },
  {
    id: 'ouaga-somgande',
    label: 'Somgande',
    address: 'Somgande, Ouagadougou',
    district: 'Somgande',
    coordinates: { latitude: 12.4058, longitude: -1.5038 },
  },
  {
    id: 'ouaga-pissy',
    label: 'Pissy',
    address: 'Pissy, Ouagadougou',
    district: 'Pissy',
    coordinates: { latitude: 12.3446, longitude: -1.5746 },
  },
  {
    id: 'ouaga-kilwin',
    label: 'Kilwin',
    address: 'Kilwin, Ouagadougou',
    district: 'Kilwin',
    coordinates: { latitude: 12.395, longitude: -1.557 },
  },
  {
    id: 'ouaga-saaba',
    label: 'Saaba',
    address: 'Saaba, Ouagadougou',
    district: 'Saaba',
    coordinates: { latitude: 12.371, longitude: -1.414 },
  },
  {
    id: 'ouaga-gare-routiere-ouaga-inter',
    label: 'Gare routiere Ouaga Inter',
    address: 'Gare routiere Ouaga Inter, Ouagadougou',
    district: 'Centre',
    coordinates: { latitude: 12.3637, longitude: -1.5331 },
  },
  {
    id: 'ouaga-aeroport',
    label: 'Aeroport de Ouagadougou',
    address: 'Aeroport international Thomas Sankara, Ouagadougou',
    district: 'Centre',
    coordinates: { latitude: 12.3532, longitude: -1.5124 },
  },
  {
    id: 'bobo-belleville',
    label: 'Belleville',
    address: 'Belleville, Bobo-Dioulasso',
    district: 'Belleville',
    coordinates: { latitude: 11.1858, longitude: -4.2864 },
  },
  {
    id: 'bobo-colma',
    label: 'Colma',
    address: 'Colma, Bobo-Dioulasso',
    district: 'Colma',
    coordinates: { latitude: 11.1802, longitude: -4.3032 },
  },
  {
    id: 'bobo-secteur-22',
    label: 'Secteur 22',
    address: 'Secteur 22, Bobo-Dioulasso',
    district: 'Secteur 22',
    coordinates: { latitude: 11.1657, longitude: -4.3096 },
  },
];

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

function toPlace(result: NominatimResult): Place | null {
  const coordinates = normalizeMapCoordinatePair({
    latitude: result.lat,
    longitude: result.lon,
  });

  if (!coordinates) {
    return null;
  }

  const parts = result.display_name.split(', ');
  const label = parts[0] ?? result.display_name;
  const address = parts.slice(0, 3).join(', ');
  return {
    id: String(result.place_id),
    label,
    address,
    coordinates,
  };
}

function compactSuggestionLabel(label: unknown): string {
  const normalized =
    typeof label === 'string' && label.trim().length > 0
      ? label.trim()
      : 'Lieu';
  return normalized.length > 24 ? `${normalized.slice(0, 23).trim()}…` : normalized;
}

function normalizeSearchToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compactSearchToken(value: string) {
  return normalizeSearchToken(value).replace(/\s+/g, '');
}

function uniqueWords(value: string) {
  return Array.from(new Set(normalizeSearchToken(value).split(' ').filter(Boolean)));
}

function levenshteinDistance(left: string, right: string, maxDistance = 2) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = current[0];

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      const cost = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
      current[j] = cost;
      rowMin = Math.min(rowMin, cost);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[right.length];
}

function resolveTypoTolerance(token: string) {
  if (token.length >= 7) return 2;
  if (token.length >= 4) return 1;
  return 0;
}

function tokenMatchesWord(token: string, word: string) {
  if (!token || !word) return false;
  if (word.includes(token) || word.startsWith(token)) return true;

  const tolerance = resolveTypoTolerance(token);
  return tolerance > 0 && levenshteinDistance(token, word, tolerance) <= tolerance;
}

function tokenMatchesPlace(token: string, words: string[]) {
  if (token.length === 1) {
    return words.some((word) => word.startsWith(token));
  }

  return words.some((word) => tokenMatchesWord(token, word));
}

function scoreLocalPlace(place: Place, query: string, cityHint: string) {
  const normalizedQuery = normalizeSearchToken(query);
  if (normalizedQuery.length < MIN_LOCAL_QUERY_LENGTH) return 0;

  const normalizedCity = normalizeSearchToken(cityHint);
  const aliases = PLACE_ALIASES[place.id] ?? [];
  const haystack = normalizeSearchToken(
    `${place.label} ${place.address} ${place.district ?? ''} ${aliases.join(' ')}`,
  );
  const compactHaystack = compactSearchToken(haystack);
  const compactQuery = compactSearchToken(normalizedQuery);
  const label = normalizeSearchToken(place.label);
  const address = normalizeSearchToken(place.address);
  const words = uniqueWords(haystack);
  const queryParts = normalizedQuery.split(' ').filter(Boolean);
  const everyPartMatches = queryParts.every((part) =>
    tokenMatchesPlace(part, words),
  );
  const compactMatches =
    compactQuery.length >= 3 &&
    (compactHaystack.includes(compactQuery) ||
      levenshteinDistance(
        compactQuery,
        compactSearchToken(label),
        resolveTypoTolerance(compactQuery),
      ) <= resolveTypoTolerance(compactQuery));

  if (!everyPartMatches && !compactMatches) return 0;

  let score = 20;
  if (label === normalizedQuery) score += 80;
  if (label.startsWith(normalizedQuery)) score += 55;
  if (address.startsWith(normalizedQuery)) score += 35;
  if (haystack.includes(` ${normalizedQuery}`)) score += 25;
  if (compactMatches) score += 32;
  if (!everyPartMatches && compactMatches) score += 10;
  if (aliases.some((alias) => normalizeSearchToken(alias) === normalizedQuery)) {
    score += 70;
  }
  if (normalizedCity && haystack.includes(normalizedCity)) score += 12;
  score += Math.max(0, 18 - label.length / 3);

  return score;
}

function searchLocalPlaces(
  query: string,
  cityHint: string,
  userPlaces: Place[] = [],
) {
  const uniquePlaces = mergePlaces(
    userPlaces,
    LOCAL_BURKINA_PLACES,
    userPlaces.length + LOCAL_BURKINA_PLACES.length,
  );

  return uniquePlaces
    .map((place) => ({ place, score: scoreLocalPlace(place, query, cityHint) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.place)
    .slice(0, 6);
}

function mergePlaces(primary: Place[], secondary: Place[], limit = 6) {
  const seen = new Set<string>();
  const merged: Place[] = [];

  for (const place of [...primary, ...secondary]) {
    const key = normalizeSearchToken(`${place.label}|${place.address}`);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }

  return merged.slice(0, limit);
}

function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
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
  cityHint?: string;
}

export function PlaceSearch({
  placeholder,
  onSelectPlace,
  tone = 'teal',
  suggestions = [],
  suggestionLabel = 'Suggestions',
  cityHint = 'Burkina Faso',
}: PlaceSearchProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeSuggestions = useMemo(
    () =>
      suggestions
        .filter((place) => place && typeof place.id === 'string')
        .map((place) => ({
          ...place,
          label: typeof place.label === 'string' && place.label.trim()
            ? place.label.trim()
            : 'Lieu',
          address: typeof place.address === 'string' && place.address.trim()
            ? place.address.trim()
            : 'Adresse non précisée',
        })),
    [suggestions],
  );

  const accentColor =
    tone === 'teal'
      ? theme.colors.teal
      : tone === 'sky'
        ? theme.colors.sky
        : theme.colors.amber;

  const search = useCallback(async (q: string) => {
    const localResults = searchLocalPlaces(q, cityHint, safeSuggestions);

    if (q.trim().length < MIN_LOCAL_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      return;
    }

    setResults(localResults);

    if (q.trim().length < 3) {
      setError(null);
      return;
    }

    setIsSearching(true);
    setError(null);
    const timeout = createTimeoutSignal(8000);
    try {
      const normalizedCityHint = cityHint.trim();
      const cityKey = normalizedCityHint.toUpperCase().replace(/\s+/g, '_');
      const viewbox =
        CITY_VIEWBOXES[cityKey] ??
        CITY_VIEWBOXES[normalizedCityHint.toUpperCase()] ??
        BURKINA_VIEWBOX;
      const locationHint =
        normalizedCityHint.length > 0 && normalizedCityHint !== 'Burkina Faso'
          ? `${normalizedCityHint}, Burkina Faso`
          : 'Burkina Faso';
      const params = new URLSearchParams({
        q: `${q}, ${locationHint}`,
        format: 'json',
        limit: '5',
        countrycodes: 'bf',
        viewbox,
        bounded: '0',
        addressdetails: '1',
      });
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
        headers: { 'Accept-Language': 'fr', 'User-Agent': 'OrbiApp/1.0' },
        signal: timeout.signal,
      });
      if (!response.ok) throw new Error('Recherche indisponible');
      const data: NominatimResult[] = await response.json();
      const remoteResults = data
        .map(toPlace)
        .filter((place): place is Place => place !== null);
      setResults(mergePlaces(localResults, remoteResults));
    } catch {
      setError(
        localResults.length > 0
          ? null
          : 'Recherche indisponible. Verifiez la connexion.',
      );
      setResults(localResults);
    } finally {
      timeout.clear();
      setIsSearching(false);
    }
  }, [cityHint, safeSuggestions]);

  const handleChange = useCallback(
    (text: string) => {
      setQuery(text);
      setResults(searchLocalPlaces(text, cityHint, safeSuggestions));
      setError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void search(text), DEBOUNCE_MS);
    },
    [cityHint, safeSuggestions, search],
  );

  const handleSelect = useCallback(
    (place: Place) => {
      onSelectPlace(place);
      setQuery(place.address);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setResults([]);
    },
    [onSelectPlace],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
              setError(null);
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

      {results.length === 0 && safeSuggestions.length > 0 ? (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsLabel}>{suggestionLabel}</Text>
          <View style={styles.suggestionsGrid}>
            {safeSuggestions.slice(0, 4).map((place) => (
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
