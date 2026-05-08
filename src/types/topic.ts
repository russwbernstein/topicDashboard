export type EntityType = 'topic' | 'tag-category';

export type ReadinessState = 'Ready' | 'At Risk' | 'Not Ready';

export type MomentumTier = 'Super-Hot' | 'Hot' | 'Watch' | 'Expired';

export type OverrideMode = 'force-enable' | 'suppress';

export interface ExistingPage {
  type: string;
  title: string;
  url?: string;
  refId?: string;
}

export interface LinkedEntity {
  type: 'Talent' | 'Channel' | 'Show' | 'League' | 'External';
  name: string;
  id: string;
}

export interface RepresentativeContent {
  title: string;
  type: 'Track' | 'Episode' | 'Clip' | 'Show';
  engagement: number;
  freshness: string;
}

export interface CoverageBucket {
  count: number;
  percentile: number;
}

export interface MomentumPoint {
  date: string;
  score: number;
}

export interface HotTopicRadarMatch {
  radarId: string;
  radarTitle: string;
  radarSubtitle?: string;
  category?: string;
  date?: string;
  matchType: 'perfect' | 'suggested';
  matchedTerm: string;
  searchTerm?: string;
  confidence?: number;
  source?: string;
  traffic?: number;
  trendStatus?: string;
  velocity?: string;
  sxmRelevance?: number;
  whyTrending?: string[];
  sources?: Array<{
    title: string;
    url: string;
  }>;
}

export interface TopicRecord {
  id: string;
  name: string;
  type: EntityType;
  taxonomy: string;
  approved: boolean;
  coverageScore: number;
  engagementScore: number;
  momentumScore: number;
  confidenceScore: number;
  taggedContentCount: number;
  totalContentCount: number;
  freshVolume: number;
  velocity: number;
  editorialBoost: number;
  hotTopicRadar: boolean;
  discoverable: boolean;
  recommendable: boolean;
  visible?: boolean;
  lastUpdated: string;
  linkedEntities: LinkedEntity[];
  existingPages: ExistingPage[];
  representativeContent: RepresentativeContent[];
  coverageDetails?: Record<string, CoverageBucket>;
  momentumHistory?: MomentumPoint[];
  radarMatches?: HotTopicRadarMatch[];
  override?: {
    mode: OverrideMode;
    reason: string;
  };
}

export interface Thresholds {
  coverageReady: number;
  engagementReady: number;
  momentumHot: number;
  momentumSuperHot: number;
  momentumExpired: number;
}

export interface ScoreApiRecord {
  id: string;
  coverageScore?: number;
  engagementScore?: number;
  momentumScore?: number;
  confidenceScore?: number;
  freshVolume?: number;
  velocity?: number;
  editorialBoost?: number;
  taggedContentCount?: number;
  totalContentCount?: number;
  coverageDetails?: Record<string, CoverageBucket>;
  momentumHistory?: MomentumPoint[];
  lastUpdated?: string;
}
