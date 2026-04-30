import { Injectable } from '@nestjs/common';
import { VoiceLocationIntentDto } from './dto/voice-location-intent.dto';

type Landmark = {
  id: string;
  name: string;
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  aliases: string[];
};

@Injectable()
export class VoiceService {
  private readonly landmarks: Landmark[] = [
    {
      id: 'ouaga-2000',
      name: 'Ouaga 2000',
      address: 'Ouaga 2000, Ouagadougou',
      district: 'Ouagadougou',
      latitude: 12.3274,
      longitude: -1.5339,
      aliases: ['ouaga 2000', 'ougadougou 2000', 'quartier ouaga 2000'],
    },
    {
      id: 'ouaga-universite-joseph-ki-zerbo',
      name: 'Universite Joseph Ki-Zerbo',
      address: 'Universite Joseph Ki-Zerbo, Ouagadougou',
      district: 'Ouagadougou',
      latitude: 12.3714,
      longitude: -1.5197,
      aliases: [
        'universite joseph ki zerbo',
        'universite de ouaga',
        'campus ki zerbo',
      ],
    },
    {
      id: 'ouaga-aeroport-international',
      name: 'Aeroport International de Ouagadougou',
      address: 'Aeroport International de Ouagadougou',
      district: 'Ouagadougou',
      latitude: 12.3532,
      longitude: -1.5124,
      aliases: ['aeroport', 'aeroport de ouaga', 'aeroport international'],
    },
    {
      id: 'ouaga-zone-du-bois',
      name: 'Zone du Bois',
      address: 'Zone du Bois, Ouagadougou',
      district: 'Ouagadougou',
      latitude: 12.3536,
      longitude: -1.5277,
      aliases: ['zone du bois', 'bois', 'quartier zone du bois'],
    },
    {
      id: 'ouaga-koulouba',
      name: 'Koulouba',
      address: 'Koulouba, Ouagadougou',
      district: 'Ouagadougou',
      latitude: 12.3605,
      longitude: -1.5368,
      aliases: ['koulouba', 'quartier koulouba'],
    },
    {
      id: 'bobo-gare-routiere',
      name: 'Gare Routiere de Bobo-Dioulasso',
      address: 'Gare Routiere de Bobo-Dioulasso',
      district: 'Bobo-Dioulasso',
      latitude: 11.1858,
      longitude: -4.2864,
      aliases: [
        'gare routiere bobo',
        'gare de bobo',
        'gare routiere de bobo-dioulasso',
      ],
    },
    {
      id: 'bobo-sarfalao',
      name: 'Sarfalao',
      address: 'Sarfalao, Bobo-Dioulasso',
      district: 'Bobo-Dioulasso',
      latitude: 11.1645,
      longitude: -4.2971,
      aliases: ['sarfalao', 'quartier sarfalao'],
    },
    {
      id: 'ouahigouya-centre-ville',
      name: 'Centre-ville',
      address: 'Centre-ville, Ouahigouya',
      district: 'Ouahigouya',
      latitude: 13.5828,
      longitude: -2.4185,
      aliases: ['centre ville', 'centre-ville', 'centre ouahigouya'],
    },
    {
      id: 'ouahigouya-secteur-9',
      name: 'Secteur 9',
      address: 'Secteur 9, Ouahigouya',
      district: 'Ouahigouya',
      latitude: 13.5766,
      longitude: -2.4216,
      aliases: ['secteur 9', 'secteur neuf'],
    },
  ];

  resolveLocationIntent(payload: VoiceLocationIntentDto) {
    const normalizedTranscript = this.normalize(payload.transcript);
    const intentType = this.resolveIntentType(normalizedTranscript);
    const suggestions = this.landmarks
      .map((landmark) => ({
        id: landmark.id,
        name: landmark.name,
        address: landmark.address,
        district: landmark.district,
        latitude: landmark.latitude,
        longitude: landmark.longitude,
        confidence: this.scoreLandmark(normalizedTranscript, landmark),
      }))
      .filter((item) => item.confidence > 0.2)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 3);

    const topConfidence = suggestions[0]?.confidence ?? 0;

    return {
      locale: 'fr-BF',
      transcript: payload.transcript,
      normalizedTranscript,
      interpretation:
        intentType === 'destination'
          ? 'Destination detectee depuis la commande vocale.'
          : intentType === 'pickup'
            ? 'Point de depart detecte depuis la commande vocale.'
            : 'Recherche vocale de lieu pour le lancement Burkina Faso.',
      intentType,
      confidence: Number(topConfidence.toFixed(2)),
      needsClarification: topConfidence < 0.74,
      suggestions: suggestions.length
        ? suggestions
        : [
            {
              id: 'ouaga-2000',
              name: 'Ouaga 2000',
              address: 'Ouaga 2000, Ouagadougou',
              district: 'Ouagadougou',
              latitude: 12.3274,
              longitude: -1.5339,
              confidence: 0.42,
            },
            {
              id: 'ouaga-universite-joseph-ki-zerbo',
              name: 'Universite Joseph Ki-Zerbo',
              address: 'Universite Joseph Ki-Zerbo, Ouagadougou',
              district: 'Ouagadougou',
              latitude: 12.3714,
              longitude: -1.5197,
              confidence: 0.38,
            },
          ],
    };
  }

  private resolveIntentType(transcript: string) {
    if (
      transcript.includes('aller a') ||
      transcript.includes('vais a') ||
      transcript.includes('va a') ||
      transcript.includes('destination') ||
      transcript.includes('depose')
    ) {
      return 'destination';
    }

    if (
      transcript.includes('je suis a') ||
      transcript.includes('viens me chercher') ||
      transcript.includes('depart') ||
      transcript.includes('pickup')
    ) {
      return 'pickup';
    }

    return 'unknown';
  }

  private scoreLandmark(transcript: string, landmark: Landmark) {
    let bestScore = 0;

    for (const alias of landmark.aliases) {
      const normalizedAlias = this.normalize(alias);

      if (transcript.includes(normalizedAlias)) {
        bestScore = Math.max(bestScore, 0.96);
        continue;
      }

      const aliasTokens = normalizedAlias.split(' ');
      const matchedTokens = aliasTokens.filter((token) =>
        transcript.includes(token),
      ).length;
      const tokenScore = matchedTokens / aliasTokens.length;
      bestScore = Math.max(bestScore, tokenScore * 0.86);
    }

    return Number(bestScore.toFixed(2));
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}
