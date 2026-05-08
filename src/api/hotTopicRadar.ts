import type { HotTopicRadarMatch, TopicRecord } from '../types/topic';

const HOT_TOPIC_RADAR_BASE_URL =
  import.meta.env.VITE_HOT_TOPIC_RADAR_BASE_URL ||
  'https://j5888xotfb.execute-api.us-east-2.amazonaws.com/dev';

interface RadarMatch {
  confidence?: number;
  search_term?: string;
  matched_term?: string;
  source?: string;
  topic_id?: string;
}

interface HotTopicRadarItem {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  date?: string;
  why_trending?: string[];
  engagement?: {
    traffic?: number;
    news_count?: number;
    topic_count?: number;
  };
  trending?: {
    velocity?: string;
    trend_status?: string;
    is_new_today?: boolean;
    is_trending_today?: boolean;
  };
  sxm_relevance?: number;
  sources?: Array<{
    title: string;
    url: string;
  }>;
  tagomatic_matches?: {
    perfect_matches?: RadarMatch[];
    suggested_matches?: RadarMatch[];
  };
}

interface HotTopicRadarResponse {
  hot_topics: HotTopicRadarItem[];
  summary?: Record<string, number>;
  total?: number;
  period?: string;
  generated_at?: string;
}

export interface HotTopicRadarResult {
  matchesByTopicId: Map<string, HotTopicRadarMatch[]>;
  matchedTopicIds: string[];
  generatedAt?: string;
  total: number;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${HOT_TOPIC_RADAR_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Hot Topic Radar ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function normalizeMatch(
  item: HotTopicRadarItem,
  match: RadarMatch,
  matchType: HotTopicRadarMatch['matchType'],
): HotTopicRadarMatch | null {
  if (!match.topic_id || !match.matched_term) return null;

  return {
    radarId: item.id,
    radarTitle: item.title,
    radarSubtitle: item.subtitle,
    category: item.category,
    date: item.date,
    matchType,
    matchedTerm: match.matched_term,
    searchTerm: match.search_term,
    confidence: match.confidence,
    source: match.source,
    traffic: item.engagement?.traffic,
    trendStatus: item.trending?.trend_status,
    velocity: item.trending?.velocity,
    sxmRelevance: item.sxm_relevance,
    whyTrending: item.why_trending || [],
    sources: item.sources || [],
  };
}

export async function fetchHotTopicRadar(period = 'today'): Promise<HotTopicRadarResult> {
  const params = new URLSearchParams({ period });
  const data = await getJson<HotTopicRadarResponse>(`/hot-topics?${params}`);
  const matchesByTopicId = new Map<string, HotTopicRadarMatch[]>();

  for (const item of data.hot_topics || []) {
    const perfectMatches = item.tagomatic_matches?.perfect_matches || [];
    const suggestedMatches = item.tagomatic_matches?.suggested_matches || [];

    const addMatch = (rawMatch: RadarMatch, matchType: HotTopicRadarMatch['matchType']) => {
      const match = normalizeMatch(item, rawMatch, matchType);
      if (!match || !rawMatch.topic_id) return;

      const current = matchesByTopicId.get(rawMatch.topic_id) || [];
      current.push(match);
      matchesByTopicId.set(rawMatch.topic_id, current);
    };

    perfectMatches.forEach((match) => addMatch(match, 'perfect'));
    suggestedMatches.forEach((match) => addMatch(match, 'suggested'));
  }

  return {
    matchesByTopicId,
    matchedTopicIds: Array.from(matchesByTopicId.keys()),
    generatedAt: data.generated_at,
    total: data.total || 0,
  };
}

export function buildRadarOnlyTopic(topicId: string, matches: HotTopicRadarMatch[]): TopicRecord {
  const bestMatch =
    matches.find((match) => match.matchType === 'perfect') ||
    [...matches].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];

  const traffic = Math.max(...matches.map((match) => match.traffic || 0), 0);

  return {
    id: topicId,
    name: bestMatch?.matchedTerm || topicId,
    type: 'topic',
    taxonomy: bestMatch?.category || 'Hot Topic Radar',
    approved: true,
    coverageScore: 0,
    engagementScore: traffic > 0 ? Math.min(100, Math.round(Math.log10(traffic + 1) * 20)) : 0,
    momentumScore: 0,
    confidenceScore: bestMatch?.confidence ? Math.round(bestMatch.confidence * 100) : 0,
    taggedContentCount: 0,
    totalContentCount: 0,
    freshVolume: 0,
    velocity: 0,
    editorialBoost: 20,
    hotTopicRadar: true,
    discoverable: false,
    recommendable: false,
    lastUpdated: bestMatch?.date ? `${bestMatch.date}T12:00:00Z` : new Date().toISOString(),
    linkedEntities: [],
    existingPages: [],
    representativeContent: [],
    radarMatches: matches,
  };
}
