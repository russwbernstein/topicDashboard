import type { CoverageBucket, MomentumPoint, ScoreApiRecord } from '../types/topic';
import { mapWithConcurrency, type ProgressCallback } from '../lib/concurrency';

const SCORE_API_BASE_URL =
  import.meta.env.VITE_SCORE_API_BASE_URL ||
  import.meta.env.VITE_TSI_API_BASE_URL ||
  (import.meta.env.DEV ? '/tsi' : 'https://tsi.us-east-2.cnt-tags.prod.cloud.siriusxm.com');

interface CoverageScoreResponse {
  id: string;
  type: string;
  score: number;
  contentCoverage: Record<string, CoverageBucket>;
}

interface MomentumScoresResponse {
  id: string;
  type: string;
  momentumScores: MomentumPoint[];
}

export interface MomentumRange {
  from: string;
  to: string;
}

interface FetchScoreBatchOptions {
  concurrency?: number;
  onProgress?: ProgressCallback;
  onError?: (id: string, error: unknown) => void;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${SCORE_API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Scores API ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function hasScoresApi() {
  return Boolean(SCORE_API_BASE_URL);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getDefaultMomentumRange(): MomentumRange {
  const to = new Date();
  to.setDate(to.getDate() + 1);

  const from = new Date(to);
  from.setDate(from.getDate() - 36);

  return {
    from: formatDate(from),
    to: formatDate(to),
  };
}

function normalizeCoverageScore(score: number) {
  return score <= 1 ? Math.round(score * 10000) / 100 : Math.round(score * 100) / 100;
}

function sumCoverageCounts(coverage: Record<string, CoverageBucket>) {
  return Object.values(coverage).reduce((sum, bucket) => sum + (bucket.count || 0), 0);
}

function encodeEntityPathId(id: string) {
  return encodeURIComponent(id).replace(/%3A/gi, ':');
}

export async function fetchCoverageScore(id: string) {
  return getJson<CoverageScoreResponse>(`/scores/${encodeEntityPathId(id)}`);
}

export async function fetchMomentumScores(id: string, range = getDefaultMomentumRange()) {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  return getJson<MomentumScoresResponse>(`/momentum-scores/${encodeEntityPathId(id)}?${params}`);
}

export async function fetchTopicScore(id: string, range = getDefaultMomentumRange()): Promise<ScoreApiRecord> {
  const [coverage, momentum] = await Promise.all([
    fetchCoverageScore(id),
    fetchMomentumScores(id, range),
  ]);

  const history = [...(momentum.momentumScores || [])].sort((a, b) => a.date.localeCompare(b.date));
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const contentCount = sumCoverageCounts(coverage.contentCoverage || {});

  return {
    id,
    coverageScore: normalizeCoverageScore(coverage.score),
    momentumScore: latest?.score,
    velocity: latest && previous ? latest.score - previous.score : undefined,
    taggedContentCount: contentCount,
    totalContentCount: contentCount,
    coverageDetails: coverage.contentCoverage,
    momentumHistory: history,
    lastUpdated: latest ? `${latest.date}T12:00:00Z` : undefined,
  };
}

export async function fetchScoreBatch(
  ids: string[],
  range = getDefaultMomentumRange(),
  options: FetchScoreBatchOptions = {},
) {
  const uniqueIds = Array.from(new Set(ids));
  return mapWithConcurrency(
    uniqueIds,
    options.concurrency || 8,
    async (id) => {
      try {
        return await fetchTopicScore(id, range);
      } catch (error) {
        options.onError?.(id, error);
        return null;
      }
    },
    options.onProgress,
  );
}
