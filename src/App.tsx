import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Download,
  ExternalLink,
  Flame,
  Gauge,
  Link2,
  Pin,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchEntityManagementEntity,
  fetchEntityManagementSearch,
  type EntityManagementEntity,
  type EntityManagementSearchResult,
} from './api/entityManagement';
import { buildRadarOnlyTopic, fetchHotTopicRadar } from './api/hotTopicRadar';
import {
  fetchCategory,
  fetchContentLinks,
  fetchTopic,
  fetchTopicContentTags,
  fetchTopicProfilesBatch,
  type TagomaticTopic,
} from './api/tagomatic';
import { fetchScoreBatch, hasScoresApi } from './api/scores';
import { top500Topics } from './data/top500Topics';
import {
  DEFAULT_THRESHOLDS,
  formatPercent,
  getGapReasons,
  getMomentumTier,
  getReadiness,
  getScoreTone,
} from './lib/readiness';
import type { EntityType, HotTopicRadarMatch, ReadinessState, ScoreApiRecord, TopicRecord } from './types/topic';

type TypeFilter = 'all' | EntityType;
type MomentumFilter = 'all' | 'hot' | 'radar';
type StatusFilter = 'all' | ReadinessState;
type SortKey = 'rank' | 'coverage' | 'engagement' | 'momentum' | 'updated';

type TagomaticSnapshot = {
  loading: boolean;
  error?: string;
  contentTags?: number;
  contentLinks?: number;
  categoryName?: string;
  topicName?: string;
  topicStatus?: string;
  topicDescription?: string;
};

const statusIcon = {
  Ready: CheckCircle2,
  'At Risk': TriangleAlert,
  'Not Ready': XCircle,
};

function mergeScoreRecords(topics: TopicRecord[], scores: ScoreApiRecord[]) {
  const byId = new Map(scores.map((score) => [score.id, score]));

  return topics.map((topic) => {
    const score = byId.get(topic.id);
    if (!score) return topic;

    return {
      ...topic,
      coverageScore: score.coverageScore ?? topic.coverageScore,
      engagementScore: score.engagementScore ?? topic.engagementScore,
      momentumScore: score.momentumScore ?? topic.momentumScore,
      confidenceScore: score.confidenceScore ?? topic.confidenceScore,
      freshVolume: score.freshVolume ?? topic.freshVolume,
      velocity: score.velocity ?? topic.velocity,
      editorialBoost: score.editorialBoost ?? topic.editorialBoost,
      totalContentCount: score.totalContentCount ?? topic.totalContentCount,
      coverageDetails: score.coverageDetails ?? topic.coverageDetails,
      momentumHistory: score.momentumHistory ?? topic.momentumHistory,
      lastUpdated: score.lastUpdated ?? topic.lastUpdated,
    };
  });
}

function normalizeApiScore(value?: number) {
  if (value === undefined || value === null) return undefined;
  return value <= 1 ? Math.round(value * 10000) / 100 : Math.round(value * 100) / 100;
}

function mergeTagomaticProfiles(topics: TopicRecord[], profiles: TagomaticTopic[]) {
  const byId = new Map(profiles.map((profile) => [profile.topic_id, profile]));

  return topics.map((topic) => {
    const profile = byId.get(topic.id);
    if (!profile) return topic;

    const confidenceScore = normalizeApiScore(profile.confidence_score);
    const externalLinks = [
      ...(profile.linked_entity
        ? [{ type: 'External' as const, name: profile.linked_entity, id: profile.linked_entity }]
        : []),
      ...(profile.external_refs || [])
        .filter((ref) => ref.ref_id)
        .map((ref) => ({
          type: 'External' as const,
          name: ref.ref_type ? `${ref.ref_type}: ${ref.ref_id}` : ref.ref_id || 'External ref',
          id: ref.ref_id || String(ref.id || ''),
        })),
    ];
    return {
      ...topic,
      name: profile.short_name || profile.term || topic.name,
      taxonomy: profile.taxonomy_pandora_id || topic.taxonomy,
      approved: profile.approval_status ? profile.approval_status === 'approved' : topic.approved,
      discoverable: profile.is_discoverable ?? topic.discoverable,
      recommendable: profile.is_recommendable ?? topic.recommendable,
      visible: profile.is_visible ?? topic.visible,
      confidenceScore: confidenceScore ?? topic.confidenceScore,
      linkedEntities: externalLinks.length > 0 ? externalLinks : topic.linkedEntities,
    };
  });
}

function mergeEntityManagementEntity(topics: TopicRecord[], entity: EntityManagementEntity) {
  const controls = entity.accessControls?.default;

  return topics.map((topic) => {
    if (topic.id !== entity.id) return topic;

    return {
      ...topic,
      name: entity.shortName || entity.name || topic.name,
      approved: entity.approvalStatus ? entity.approvalStatus === 'approved' : topic.approved,
      discoverable: controls?.discoverable ?? topic.discoverable,
      recommendable: controls?.recommendable ?? topic.recommendable,
      visible: controls?.visible ?? topic.visible,
    };
  });
}

function mergeHotTopicRadarMatches(topics: TopicRecord[], matchesByTopicId: Map<string, HotTopicRadarMatch[]>) {
  const existingIds = new Set(topics.map((topic) => topic.id));
  const merged = topics.map((topic) => {
    const matches = matchesByTopicId.get(topic.id) || [];
    if (matches.length === 0) return { ...topic, hotTopicRadar: false, radarMatches: undefined };

    return {
      ...topic,
      hotTopicRadar: true,
      radarMatches: matches,
    };
  });

  for (const [topicId, matches] of matchesByTopicId.entries()) {
    if (!matches || existingIds.has(topicId)) continue;
    merged.push(buildRadarOnlyTopic(topicId, matches));
  }

  return merged;
}

function mergeEntitySearchResults(
  topics: TopicRecord[],
  topicId: string,
  query: string,
  results: EntityManagementSearchResult[],
) {
  const entityLinks = buildEntitySearchLinks(results, query);

  return topics.map((topic) => {
    if (topic.id !== topicId) return topic;

    return {
      ...topic,
      existingPages: entityLinks.length > 0 ? entityLinks : topic.existingPages,
    };
  });
}

function buildEntitySearchLinks(results: EntityManagementSearchResult[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const seenEntityIds = new Set<string>();

  return results
    .filter((result) => getEntitySearchId(result) && result.name && isDisplayableEntitySearchType(result.type))
    .filter((result) => {
      const key = getEntitySearchId(result).toLowerCase();
      if (seenEntityIds.has(key)) return false;
      seenEntityIds.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftExact = normalizeSearchText(left.name) === normalizedQuery ? 1 : 0;
      const rightExact = normalizeSearchText(right.name) === normalizedQuery ? 1 : 0;
      if (leftExact !== rightExact) return rightExact - leftExact;
      return getEntityTypePriority(left.type) - getEntityTypePriority(right.type);
    })
    .map((result) => ({
      type: getEntitySearchTypeLabel(result.type),
      title: result.name,
      refId: getEntitySearchId(result),
      url: `https://entity-management.siriusxm.com/entity/${getEntitySearchId(result)}`,
    }));
}

function getEntitySearchId(result: EntityManagementSearchResult) {
  return result.entityId || result.sourceId || '';
}

function humanizeRefType(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function normalizeSearchText(value = '') {
  return value.trim().toLowerCase();
}

function isDisplayableEntitySearchType(value = '') {
  return ['league', 'team', 'brand', 'talent', 'genre'].includes(normalizeEntitySearchType(value));
}

function getEntityTypePriority(value = '') {
  const normalized = normalizeEntitySearchType(value);
  const priority = ['talent', 'brand', 'team', 'league', 'genre'].indexOf(normalized);
  return priority === -1 ? 99 : priority;
}

function getEntitySearchTypeLabel(value = '') {
  const normalized = normalizeEntitySearchType(value);
  const labels: Record<string, string> = {
    talent: 'Talent',
    brand: 'Brand',
    team: 'Sports Team',
    league: 'Sports League',
    genre: 'Genre',
  };

  return labels[normalized] || humanizeRefType(value || 'Entity');
}

function normalizeEntitySearchType(value = '') {
  const normalized = value.replace(/[\s_-]+/g, '').toLowerCase();
  if (normalized === 'sportsteam') return 'team';
  if (normalized === 'sportsleague') return 'league';
  return normalized;
}

function downloadCsv(records: TopicRecord[]) {
  const columns = [
    'id',
    'name',
    'type',
    'taxonomy',
    'readiness',
    'coverageScore',
    'engagementScore',
    'momentumScore',
    'momentumTier',
    'confidenceScore',
    'taggedContentCount',
    'totalContentCount',
    'tagVolumeSince2026-04-01',
    'discoverable',
    'recommendable',
    'visible',
    'hotTopicRadar',
    'lastUpdated',
  ];

  const escape = (value: string | number | boolean) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = records.map((topic) => [
    topic.id,
    topic.name,
    topic.type,
    topic.taxonomy,
    getReadiness(topic),
    topic.coverageScore,
    topic.engagementScore,
    topic.momentumScore,
    getMomentumTier(topic.momentumScore),
    topic.confidenceScore,
    topic.taggedContentCount,
    topic.totalContentCount,
    topic.freshVolume,
    topic.discoverable,
    topic.recommendable,
    topic.visible ?? false,
    topic.hotTopicRadar,
    topic.lastUpdated,
  ]);

  const csv = [columns.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'topic-readiness-export.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const tone = getScoreTone(value);

  return (
    <div className="metric">
      <div className="metric-label">
        <span>{label}</span>
        <strong>{formatPercent(value)}</strong>
      </div>
      <div className="meter" aria-hidden="true">
        <span className={`meter-fill ${tone}`} style={{ width: `${Math.max(4, value)}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: ReadinessState }) {
  const Icon = statusIcon[state];
  return (
    <span className={`status-badge ${state.toLowerCase().replaceAll(' ', '-')}`}>
      <Icon size={15} />
      {state}
    </span>
  );
}

function getRadarBadgeLabel(matches?: HotTopicRadarMatch[]) {
  if (!matches || matches.length === 0) return 'Radar';
  const hasPerfect = matches.some((match) => match.matchType === 'perfect');
  return hasPerfect ? 'Radar Perfect' : 'Radar Suggested';
}

function MomentumSparkline({ points }: { points?: { date: string; score: number }[] }) {
  if (!points || points.length === 0) {
    return <div className="empty-chart">No momentum history loaded</div>;
  }

  const values = points.map((point) => point.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.1, max - min);

  return (
    <div className="sparkline" aria-label="Momentum score history">
      {points.map((point) => {
        const height = 20 + ((point.score - min) / range) * 70;
        return (
          <span
            key={point.date}
            style={{ height: `${height}%` }}
            title={`${point.date}: ${point.score.toFixed(3)}`}
          />
        );
      })}
    </div>
  );
}

function TopicRow({
  topic,
  selected,
  pinned,
  onSelect,
  onTogglePin,
}: {
  topic: TopicRecord;
  selected: boolean;
  pinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const readiness = getReadiness(topic);
  const tier = getMomentumTier(topic.momentumScore);

  return (
    <article className={`topic-row ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="topic-main">
        <button
          className={`icon-button pin-button ${pinned ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePin();
          }}
          title={pinned ? 'Remove compare pin' : 'Pin for comparison'}
          aria-label={pinned ? 'Remove compare pin' : 'Pin for comparison'}
        >
          <Pin size={16} />
        </button>
        <div className="topic-title-group">
          <div className="topic-title-line">
            <h2>{topic.name}</h2>
            {topic.override && (
              <span className={`override-badge ${topic.override.mode}`}>
                <ShieldAlert size={14} />
                Override
              </span>
            )}
          </div>
          <div className="topic-meta">
            <span>{topic.id}</span>
            <span>{topic.type === 'topic' ? 'Topic' : 'Tag Category'}</span>
            <span>{topic.taxonomy}</span>
          </div>
        </div>
      </div>

      <div className="topic-signals">
        <StatusBadge state={readiness} />
        {topic.hotTopicRadar && (
          <span className="radar-badge">
            <Flame size={14} />
            {getRadarBadgeLabel(topic.radarMatches)}
          </span>
        )}
        <span className={`momentum-pill ${tier.toLowerCase().replaceAll('-', '').replaceAll(' ', '')}`}>
          {tier}
        </span>
      </div>

      <div className="topic-metrics">
        <MetricBar label="Coverage" value={topic.coverageScore} />
        <MetricBar label="Engagement" value={topic.engagementScore} />
        <MetricBar label="Confidence" value={topic.confidenceScore} />
      </div>

      <div className="topic-rank">
        <span>Tags since 4/1</span>
        <strong>{topic.freshVolume.toLocaleString()}</strong>
      </div>
    </article>
  );
}

function DetailPanel({
  topic,
  snapshot,
  syncing,
  onSyncTagomatic,
}: {
  topic: TopicRecord;
  snapshot?: TagomaticSnapshot;
  syncing: boolean;
  onSyncTagomatic: () => void;
}) {
  const readiness = getReadiness(topic);
  const gaps = getGapReasons(topic);
  const tier = getMomentumTier(topic.momentumScore);
  const [entityLinksExpanded, setEntityLinksExpanded] = useState(false);
  const visibleExistingPages = entityLinksExpanded ? topic.existingPages : topic.existingPages.slice(0, 2);
  const hiddenExistingPageCount = Math.max(0, topic.existingPages.length - visibleExistingPages.length);
  const tagrUrl = `https://goliath.savagebeast.com/tagr/topic/${encodeURIComponent(topic.id).replace(/%3A/gi, ':')}`;
  const entityDetailUrl = `https://entity-management.siriusxm.com/entity/${encodeURIComponent(topic.id).replace(/%3A/gi, ':')}`;
  const coverageDetailUrl = `https://entity-management.siriusxm.com/coverage/${encodeURIComponent(topic.id).replace(/%3A/gi, ':')}`;

  useEffect(() => {
    setEntityLinksExpanded(false);
  }, [topic.id]);

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{topic.taxonomy}</p>
          <h2>{topic.name}</h2>
          <div className="detail-link-row">
            <a href={tagrUrl} target="_blank" rel="noreferrer">
              Tagr
              <ExternalLink size={13} />
            </a>
            <a href={entityDetailUrl} target="_blank" rel="noreferrer">
              Entity detail
              <ExternalLink size={13} />
            </a>
            <a href={coverageDetailUrl} target="_blank" rel="noreferrer">
              Coverage detail
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
        <StatusBadge state={readiness} />
      </div>

      <div className="detail-grid">
        <MetricBar label="Coverage" value={topic.coverageScore} />
        <MetricBar label="Engagement" value={topic.engagementScore} />
        <MetricBar label="Confidence" value={topic.confidenceScore} />
        <div className="momentum-block">
          <span>Momentum</span>
          <strong>{topic.momentumScore.toFixed(3)}</strong>
          <em>{tier}</em>
        </div>
      </div>

      <section className="detail-section">
        <div className="section-title">
          <Flame size={16} />
          <h3>Momentum History</h3>
        </div>
        <MomentumSparkline points={topic.momentumHistory} />
      </section>

      <section className="detail-section">
        <div className="section-title">
          <ExternalLink size={16} />
          <h3>Existing Pages / Entity Links</h3>
        </div>
        <div className="page-list">
          {visibleExistingPages.map((page) => (
            page.url ? (
              <a key={`${page.type}-${page.refId || page.title}`} href={page.url} target="_blank" rel="noreferrer">
                <span>{page.type}</span>
                <strong>{page.title}</strong>
                <ExternalLink size={14} />
              </a>
            ) : (
              <div key={`${page.type}-${page.refId || page.title}`} className="page-static">
                <span>{page.type}</span>
                <strong>{page.title}</strong>
              </div>
            )
          ))}
          {topic.existingPages.length > 2 && (
            <button
              className="link-toggle-button"
              type="button"
              onClick={() => setEntityLinksExpanded((expanded) => !expanded)}
            >
              {entityLinksExpanded ? (
                <>
                  <ChevronUp size={15} />
                  Show fewer
                </>
              ) : (
                <>
                  <ChevronDown size={15} />
                  Show {hiddenExistingPageCount} more
                </>
              )}
            </button>
          )}
          {topic.existingPages.length === 0 && <span>No entity links found</span>}
        </div>
      </section>

      {topic.coverageDetails && (
        <section className="detail-section">
          <div className="section-title">
            <Tag size={16} />
            <h3>Coverage Composition</h3>
          </div>
          <div className="coverage-grid">
            {Object.entries(topic.coverageDetails).map(([key, bucket]) => (
              <div key={key} className="coverage-bucket">
                <span>{key}</span>
                <strong>{bucket.count.toLocaleString()}</strong>
                <em>{bucket.percentile.toFixed(1)} percentile</em>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="detail-section">
        <div className="section-title">
          <Gauge size={16} />
          <h3>Readiness Gates</h3>
        </div>
        <div className="gate-grid">
          <span className={topic.approved ? 'gate on' : 'gate'}>{topic.approved ? 'Approved' : 'Not Approved'}</span>
          <span className={topic.hotTopicRadar ? 'gate on radar' : 'gate'}>Hot Topic Radar</span>
          <span className={topic.visible ? 'gate on' : 'gate'}>Visible</span>
          <span className={topic.discoverable ? 'gate on' : 'gate'}>Discoverable</span>
          <span className={topic.recommendable ? 'gate on' : 'gate'}>Recommendable</span>
        </div>
      </section>

      {topic.radarMatches && topic.radarMatches.length > 0 && (
        <section className="detail-section">
          <div className="section-title">
            <Flame size={16} />
            <h3>Hot Topic Radar Matches</h3>
          </div>
          <div className="radar-match-list">
            {topic.radarMatches.map((match, index) => (
              <div key={`${match.radarId}-${match.matchedTerm}-${index}`} className="radar-match-item">
                <div>
                  <strong>{match.radarTitle}</strong>
                  <span>
                    {match.matchType === 'perfect' ? 'Perfect match' : 'Suggested match'}
                    {typeof match.confidence === 'number' ? ` · ${Math.round(match.confidence * 100)}%` : ''}
                    {match.category ? ` · ${match.category}` : ''}
                  </span>
                </div>
                {typeof match.traffic === 'number' && (
                  <div>
                    <strong>{match.traffic.toLocaleString()}</strong>
                    <span>{match.velocity || match.trendStatus || 'traffic'}</span>
                  </div>
                )}
                {match.whyTrending && match.whyTrending.length > 0 && (
                  <p>{match.whyTrending[0]}</p>
                )}
                {match.sources && match.sources.length > 0 && (
                  <a href={match.sources[0].url} target="_blank" rel="noreferrer">
                    {match.sources[0].title}
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="detail-section">
        <div className="section-title">
          <TriangleAlert size={16} />
          <h3>Gaps</h3>
        </div>
        <ul className="gap-list">
          {gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      </section>

      <section className="detail-section">
        <div className="section-title">
          <Tag size={16} />
          <h3>Tagomatic</h3>
        </div>
        <div className="tagomatic-row">
          <button className="action-button" onClick={onSyncTagomatic} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
            Sync Tagomatic
          </button>
          {snapshot?.error && <span className="api-error">{snapshot.error}</span>}
          {snapshot && !snapshot.error && !snapshot.loading && (
            <div className="snapshot-metrics">
              {typeof snapshot.contentTags === 'number' && <span>{snapshot.contentTags} content tags</span>}
              {typeof snapshot.contentLinks === 'number' && <span>{snapshot.contentLinks} content links</span>}
              {snapshot.topicName && <span>{snapshot.topicName}</span>}
              {snapshot.topicStatus && <span>{snapshot.topicStatus}</span>}
              {snapshot.categoryName && <span>{snapshot.categoryName}</span>}
            </div>
          )}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-title">
          <Link2 size={16} />
          <h3>Associations</h3>
        </div>
        <div className="association-list">
          {topic.linkedEntities.map((entity) => (
            <span key={`${entity.type}-${entity.id}`}>
              {entity.type}: {entity.name}
            </span>
          ))}
          {topic.linkedEntities.length === 0 && <span>No linked entities</span>}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-title">
          <ArrowDownUp size={16} />
          <h3>Representative Content</h3>
        </div>
        <div className="content-list">
          {topic.representativeContent.map((content) => (
            <div key={content.title} className="content-item">
              <div>
                <strong>{content.title}</strong>
                <span>{content.type}</span>
              </div>
              <div>
                <strong>{content.engagement}</strong>
                <span>{content.freshness}</span>
              </div>
            </div>
          ))}
          {topic.representativeContent.length === 0 && (
            <div className="empty-chart">Representative content endpoint not wired yet</div>
          )}
        </div>
      </section>
    </aside>
  );
}

export default function App() {
  const [topics, setTopics] = useState<TopicRecord[]>(top500Topics);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [taxonomyFilter, setTaxonomyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [momentumFilter, setMomentumFilter] = useState<MomentumFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [selectedId, setSelectedId] = useState(top500Topics[0]?.id || '');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, TagomaticSnapshot>>({});
  const [scoreRefreshState, setScoreRefreshState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [refreshError, setRefreshError] = useState('');
  const [refreshProgress, setRefreshProgress] = useState({
    radarMatched: 0,
    radarFailures: 0,
    scoresDone: 0,
    scoresTotal: top500Topics.length,
    profilesDone: 0,
    profilesTotal: top500Topics.length,
    scoreFailures: 0,
    profileFailures: 0,
  });
  const initialHydrationStarted = useRef(false);
  const entityFetchedIds = useRef(new Set<string>());
  const entitySearchFetchedKeys = useRef(new Set<string>());

  const taxonomies = useMemo(
    () => Array.from(new Set(topics.map((topic) => topic.taxonomy))).sort(),
    [topics],
  );

  const filteredTopics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return topics
      .filter((topic) => {
        if (!normalizedQuery) return true;
        return (
          topic.name.toLowerCase().includes(normalizedQuery) ||
          topic.id.toLowerCase().includes(normalizedQuery) ||
          topic.taxonomy.toLowerCase().includes(normalizedQuery)
        );
      })
      .filter((topic) => (typeFilter === 'all' ? true : topic.type === typeFilter))
      .filter((topic) => (taxonomyFilter === 'all' ? true : topic.taxonomy === taxonomyFilter))
      .filter((topic) => (statusFilter === 'all' ? true : getReadiness(topic) === statusFilter))
      .filter((topic) => {
        if (momentumFilter === 'all') return true;
        if (momentumFilter === 'radar') return topic.hotTopicRadar;
        return topic.momentumScore > DEFAULT_THRESHOLDS.momentumHot;
      })
      .sort((a, b) => {
        if (sortKey === 'coverage') return b.coverageScore - a.coverageScore;
        if (sortKey === 'engagement') return b.engagementScore - a.engagementScore;
        if (sortKey === 'momentum') return b.momentumScore - a.momentumScore;
        if (sortKey === 'updated') return Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated);
        return b.freshVolume - a.freshVolume;
      });
  }, [momentumFilter, query, sortKey, statusFilter, taxonomyFilter, topics, typeFilter]);

  const selectedTopic = topics.find((topic) => topic.id === selectedId) || filteredTopics[0] || topics[0];
  const pinnedTopics = pinnedIds.map((id) => topics.find((topic) => topic.id === id)).filter(Boolean) as TopicRecord[];
  const scoreApiConfigured = hasScoresApi();

  useEffect(() => {
    if (!selectedTopic?.id || entityFetchedIds.current.has(selectedTopic.id)) return;

    entityFetchedIds.current.add(selectedTopic.id);
    fetchEntityManagementEntity(selectedTopic.id)
      .then((entity) => {
        setTopics((current) => mergeEntityManagementEntity(current, entity));
      })
      .catch(() => {
        entityFetchedIds.current.delete(selectedTopic.id);
      });
  }, [selectedTopic?.id]);

  useEffect(() => {
    const topicId = selectedTopic?.id;
    const topicName = selectedTopic?.name?.trim();
    if (!topicId || !topicName) return;

    const searchKey = `${topicId}:${topicName.toLowerCase()}`;
    if (entitySearchFetchedKeys.current.has(searchKey)) return;

    entitySearchFetchedKeys.current.add(searchKey);
    fetchEntityManagementSearch(topicName)
      .then((results) => {
        setTopics((current) => mergeEntitySearchResults(current, topicId, topicName, results));
      })
      .catch(() => {
        entitySearchFetchedKeys.current.delete(searchKey);
      });
  }, [selectedTopic?.id, selectedTopic?.name]);

  const summary = useMemo(() => {
    const ready = filteredTopics.filter((topic) => getReadiness(topic) === 'Ready').length;
    const atRisk = filteredTopics.filter((topic) => getReadiness(topic) === 'At Risk').length;
    const hot = filteredTopics.filter((topic) => topic.momentumScore > DEFAULT_THRESHOLDS.momentumHot).length;
    const radar = filteredTopics.filter((topic) => topic.hotTopicRadar).length;
    const gaps = filteredTopics.filter((topic) => getReadiness(topic) !== 'Ready' && topic.engagementScore >= 60).length;
    return { ready, atRisk, hot, radar, gaps };
  }, [filteredTopics]);

  const togglePin = (topicId: string) => {
    setPinnedIds((current) => {
      if (current.includes(topicId)) return current.filter((id) => id !== topicId);
      return [...current, topicId].slice(-4);
    });
  };

  const syncTagomatic = async (topic: TopicRecord) => {
    setSnapshots((current) => ({ ...current, [topic.id]: { loading: true } }));

    try {
      const [contentTags, contentLinks, category, topicProfile] = await Promise.all([
        topic.type === 'topic' ? fetchTopicContentTags(topic.id) : Promise.resolve([]),
        fetchContentLinks(topic.id).catch(() => []),
        topic.type === 'tag-category' ? fetchCategory(topic.id).catch(() => undefined) : Promise.resolve(undefined),
        topic.type === 'topic' ? fetchTopic(topic.id).catch(() => undefined) : Promise.resolve(undefined),
      ]);

      setSnapshots((current) => ({
        ...current,
        [topic.id]: {
          loading: false,
          contentTags: contentTags.length,
          contentLinks: contentLinks.length,
          categoryName: category?.term,
          topicName: topicProfile?.term,
          topicStatus: topicProfile?.approval_status,
          topicDescription: topicProfile?.description,
        },
      }));

      if (topicProfile) {
        setTopics((current) => mergeTagomaticProfiles(current, [topicProfile]));
      }
    } catch (error) {
      setSnapshots((current) => ({
        ...current,
        [topic.id]: {
          loading: false,
          error: error instanceof Error ? error.message : 'Tagomatic request failed',
        },
      }));
    }
  };

  const refreshData = async () => {
    if (!scoreApiConfigured) {
      setScoreRefreshState('error');
      return;
    }

    let topicsToHydrate = topics;
    setScoreRefreshState('loading');
    setRefreshError('');
    setRefreshProgress({
      radarMatched: 0,
      radarFailures: 0,
      scoresDone: 0,
      scoresTotal: topics.length,
      profilesDone: 0,
      profilesTotal: topics.length,
      scoreFailures: 0,
      profileFailures: 0,
    });

    try {
      try {
        const radar = await fetchHotTopicRadar('today');
        topicsToHydrate = mergeHotTopicRadarMatches(topics, radar.matchesByTopicId);
        setTopics(topicsToHydrate);
        setRefreshProgress((current) => ({
          ...current,
          radarMatched: radar.matchedTopicIds.length,
          scoresTotal: topicsToHydrate.length,
          profilesTotal: topicsToHydrate.length,
        }));
      } catch {
        setRefreshProgress((current) => ({ ...current, radarFailures: 1 }));
      }

      const ids = topicsToHydrate.map((topic) => topic.id);
      const [scores, profiles] = await Promise.all([
        fetchScoreBatch(ids, undefined, {
          concurrency: 8,
          onProgress: (scoresDone, scoresTotal) => {
            setRefreshProgress((current) => ({ ...current, scoresDone, scoresTotal }));
          },
          onError: () => {
            setRefreshProgress((current) => ({ ...current, scoreFailures: current.scoreFailures + 1 }));
          },
        }),
        fetchTopicProfilesBatch(ids, {
          concurrency: 8,
          onProgress: (profilesDone, profilesTotal) => {
            setRefreshProgress((current) => ({ ...current, profilesDone, profilesTotal }));
          },
          onError: () => {
            setRefreshProgress((current) => ({ ...current, profileFailures: current.profileFailures + 1 }));
          },
        }),
      ]);

      if (scores.length === 0) {
        throw new Error('No score responses were returned');
      }

      setTopics((current) => mergeTagomaticProfiles(mergeScoreRecords(current, scores), profiles));
      setScoreRefreshState('success');
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Refresh failed');
      setScoreRefreshState('error');
    }
  };

  useEffect(() => {
    if (initialHydrationStarted.current) return;
    initialHydrationStarted.current = true;
    void refreshData();
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Entity Management POC</p>
          <h1>Topic Readiness Dashboard</h1>
        </div>
        <div className="topbar-actions">
          <span className={scoreApiConfigured ? 'api-pill live' : 'api-pill'}>
            Scores API {scoreApiConfigured ? 'on' : 'off'}
          </span>
          <button className="action-button" onClick={refreshData} disabled={scoreRefreshState === 'loading'}>
            <RefreshCw size={16} className={scoreRefreshState === 'loading' ? 'spin' : ''} />
            Refresh Data
          </button>
          <button className="action-button primary" onClick={() => downloadCsv(filteredTopics)}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </header>

      <section className="summary-grid">
        <div className="summary-card ready">
          <CheckCircle2 size={18} />
          <span>Ready</span>
          <strong>{summary.ready}</strong>
        </div>
        <div className="summary-card risk">
          <TriangleAlert size={18} />
          <span>At Risk</span>
          <strong>{summary.atRisk}</strong>
        </div>
        <div className="summary-card hot">
          <Flame size={18} />
          <span>Hot</span>
          <strong>{summary.hot}</strong>
        </div>
        <div className="summary-card radar">
          <Flame size={18} />
          <span>Radar</span>
          <strong>{summary.radar}</strong>
        </div>
        <div className="summary-card gap">
          <SlidersHorizontal size={18} />
          <span>Demand Gaps</span>
          <strong>{summary.gaps}</strong>
        </div>
      </section>

      <section className="toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topics, categories, IDs"
          />
        </label>

        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
          <option value="all">All Types</option>
          <option value="topic">Topics</option>
          <option value="tag-category">Tag Categories</option>
        </select>

        <select value={taxonomyFilter} onChange={(event) => setTaxonomyFilter(event.target.value)}>
          <option value="all">All Taxonomies</option>
          {taxonomies.map((taxonomy) => (
            <option key={taxonomy} value={taxonomy}>
              {taxonomy}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          <option value="all">All Statuses</option>
          <option value="Ready">Ready</option>
          <option value="At Risk">At Risk</option>
          <option value="Not Ready">Not Ready</option>
        </select>

        <select value={momentumFilter} onChange={(event) => setMomentumFilter(event.target.value as MomentumFilter)}>
          <option value="all">All Momentum</option>
          <option value="hot">Hot and Super-Hot</option>
          <option value="radar">Hot Topic Radar</option>
        </select>

        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
          <option value="rank">Sort by Tag Volume</option>
          <option value="coverage">Sort by Coverage</option>
          <option value="engagement">Sort by Engagement</option>
          <option value="momentum">Sort by Momentum</option>
          <option value="updated">Sort by Updated</option>
        </select>
      </section>

      {scoreRefreshState === 'error' && (
        <div className="inline-alert">
          {refreshError || 'Some score or Tagomatic requests failed.'} The dashboard is showing CSV data plus any successful hydrations.
        </div>
      )}
      {scoreRefreshState === 'loading' && (
        <div className="inline-alert progress-alert">
          <div>
            Hydrating {topics.length} CSV topics from TSI scores and Tagomatic.
          </div>
          <div className="progress-grid">
            <span>Radar {refreshProgress.radarMatched} matched ({refreshProgress.radarFailures} failed)</span>
            <span>Scores {refreshProgress.scoresDone}/{refreshProgress.scoresTotal} ({refreshProgress.scoreFailures} failed)</span>
            <span>Tagomatic {refreshProgress.profilesDone}/{refreshProgress.profilesTotal} ({refreshProgress.profileFailures} failed)</span>
          </div>
        </div>
      )}
      {scoreRefreshState === 'success' && <div className="inline-alert success">Top topic scores and Tagomatic profiles refreshed.</div>}

      <section className="workspace">
        <div className="topic-list">
          <div className="list-header">
            <span>{filteredTopics.length} CSV topics</span>
            <span>Thresholds: {DEFAULT_THRESHOLDS.coverageReady}% coverage, {DEFAULT_THRESHOLDS.engagementReady}% engagement</span>
          </div>

          {filteredTopics.map((topic) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              selected={topic.id === selectedTopic.id}
              pinned={pinnedIds.includes(topic.id)}
              onSelect={() => setSelectedId(topic.id)}
              onTogglePin={() => togglePin(topic.id)}
            />
          ))}
        </div>

        <DetailPanel
          topic={selectedTopic}
          snapshot={snapshots[selectedTopic.id]}
          syncing={snapshots[selectedTopic.id]?.loading === true}
          onSyncTagomatic={() => syncTagomatic(selectedTopic)}
        />
      </section>

      {pinnedTopics.length > 0 && (
        <section className="compare-tray">
          <div className="section-title">
            <Pin size={16} />
            <h3>Comparison</h3>
          </div>
          <div className="compare-grid">
            {pinnedTopics.map((topic) => (
              <button key={topic.id} className="compare-item" onClick={() => setSelectedId(topic.id)}>
                <span>{topic.name}</span>
                <strong>{getReadiness(topic)}</strong>
                <em>{topic.momentumScore.toFixed(3)}</em>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
