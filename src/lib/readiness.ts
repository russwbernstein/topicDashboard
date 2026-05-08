import type { MomentumTier, ReadinessState, Thresholds, TopicRecord } from '../types/topic';

export const DEFAULT_THRESHOLDS: Thresholds = {
  coverageReady: 70,
  engagementReady: 55,
  momentumHot: 8.48,
  momentumSuperHot: 9.008,
  momentumExpired: 8,
};

export function getMomentumTier(score: number, thresholds = DEFAULT_THRESHOLDS): MomentumTier {
  if (score > thresholds.momentumSuperHot) return 'Super-Hot';
  if (score > thresholds.momentumHot) return 'Hot';
  if (score < thresholds.momentumExpired) return 'Expired';
  return 'Watch';
}

export function getReadiness(topic: TopicRecord, thresholds = DEFAULT_THRESHOLDS): ReadinessState {
  if (topic.override?.mode === 'suppress') return 'Not Ready';
  if (topic.override?.mode === 'force-enable') return 'Ready';

  const hasCoverage = topic.coverageScore >= thresholds.coverageReady;
  const hasEngagement = topic.engagementScore >= thresholds.engagementReady;
  const hasMomentum = topic.momentumScore > thresholds.momentumHot || topic.hotTopicRadar;
  const hasMinimumSupply = topic.taggedContentCount >= 20 && topic.coverageScore >= 45;

  if (hasCoverage && hasEngagement) return 'Ready';
  if ((hasMomentum && hasMinimumSupply) || (hasCoverage && topic.confidenceScore >= 65)) return 'At Risk';
  if (hasEngagement && hasMinimumSupply) return 'At Risk';
  return 'Not Ready';
}

export function getGapReasons(topic: TopicRecord, thresholds = DEFAULT_THRESHOLDS): string[] {
  if (topic.override?.mode === 'suppress') {
    return [`Suppressed: ${topic.override.reason}`];
  }

  const gaps: string[] = [];
  if (topic.coverageScore < thresholds.coverageReady) {
    gaps.push(`Coverage is ${thresholds.coverageReady - topic.coverageScore} pts below ready`);
  }
  if (topic.engagementScore < thresholds.engagementReady) {
    gaps.push(`Engagement is ${thresholds.engagementReady - topic.engagementScore} pts below ready`);
  }
  if (topic.momentumScore < thresholds.momentumExpired) {
    gaps.push('Momentum is below the active watch threshold');
  }
  if (topic.taggedContentCount < 20) {
    gaps.push('Tagged content depth is thin');
  }
  if (topic.confidenceScore < 55) {
    gaps.push('Signal confidence is low');
  }
  if (gaps.length === 0) {
    gaps.push('No blocking gaps detected');
  }
  return gaps;
}

export function getRankScore(topic: TopicRecord) {
  return topic.freshVolume + topic.velocity * 10 + topic.editorialBoost;
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function getScoreTone(value: number) {
  if (value >= 75) return 'good';
  if (value >= 50) return 'warn';
  return 'bad';
}
