import { mapWithConcurrency, type ProgressCallback } from '../lib/concurrency';

const TAGOMATIC_BASE_URL =
  import.meta.env.VITE_TAGOMATIC_BASE_URL ||
  (import.meta.env.DEV ? '/tagomatic' : 'https://tagomatic.savagebeast.com');

interface TagomaticList<T> {
  results?: T[];
}

export interface TagomaticTopicContentTag {
  id: number;
  topic_id?: string;
  content_id?: string;
  content_type?: string;
  confidence?: number;
}

export interface TagomaticContentLink {
  id: number;
  from_content_id?: string;
  to_content_id?: string;
  relation?: string;
}

export interface TagomaticCategory {
  pandora_id?: string;
  term?: string;
  description?: string;
}

export interface TagomaticTopic {
  topic_id?: string;
  taxonomy_pandora_id?: string;
  term?: string;
  short_name?: string;
  description?: string;
  approval_status?: string;
  is_visible?: boolean;
  is_recommendable?: boolean;
  is_discoverable?: boolean;
  confidence_score?: number;
  linked_entity?: string;
  external_refs?: Array<{
    id?: number;
    ref_type?: string;
    ref_id?: string;
  }>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${TAGOMATIC_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Tagomatic ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function encodeEntityPathId(id: string) {
  return encodeURIComponent(id).replace(/%3A/gi, ':');
}

export async function fetchTopicContentTags(topicId: string) {
  const path = `/topic-content-tags/?topic_id=${encodeURIComponent(topicId)}`;
  const data = await getJson<TagomaticList<TagomaticTopicContentTag>>(path);
  return data.results || [];
}

export async function fetchContentLinks(contentId: string) {
  const path = `/content-links/?from_content_id=${encodeURIComponent(contentId)}`;
  const data = await getJson<TagomaticList<TagomaticContentLink>>(path);
  return data.results || [];
}

export async function fetchCategory(categoryId: string) {
  return getJson<TagomaticCategory>(`/categories/${encodeEntityPathId(categoryId)}`);
}

export async function fetchTopic(topicId: string) {
  return getJson<TagomaticTopic>(`/topics/${encodeEntityPathId(topicId)}`);
}

export async function fetchTopicProfilesBatch(
  ids: string[],
  options: { concurrency?: number; onProgress?: ProgressCallback; onError?: (id: string, error: unknown) => void } = {},
) {
  const uniqueIds = Array.from(new Set(ids));

  return mapWithConcurrency(
    uniqueIds,
    options.concurrency || 8,
    async (id) => {
      try {
        return await fetchTopic(id);
      } catch (error) {
        options.onError?.(id, error);
        return null;
      }
    },
    options.onProgress,
  );
}
