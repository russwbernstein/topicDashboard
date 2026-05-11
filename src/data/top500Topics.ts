import csv from './tousandtopics0501.csv?raw';
import type { TopicRecord } from '../types/topic';

interface CsvTopicRow {
  name: string;
  id: string;
  volume: number;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function getColumnIndex(headers: string[], candidates: string[], fallback: number) {
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  const index = candidates.findIndex((candidate) => normalizedHeaders.includes(candidate.toLowerCase()));

  if (index === -1) return fallback;
  return normalizedHeaders.indexOf(candidates[index].toLowerCase());
}

function parseTopics(rawCsv: string): CsvTopicRow[] {
  const lines = rawCsv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0] || '');
  const idIndex = getColumnIndex(headers, ['pandora_topic_id', 'topic_id', 'id'], 1);
  const nameIndex = getColumnIndex(headers, ['topic_term', 'term', 'name'], 0);
  const volumeIndex = getColumnIndex(headers, ['cnt', 'volume', 'tag_volume'], 2);

  return lines
    .slice(1)
    .map(parseCsvLine)
    .filter((cells) => cells[nameIndex] && cells[idIndex])
    .map((cells) => ({
      name: cells[nameIndex],
      id: cells[idIndex],
      volume: Number.parseInt(cells[volumeIndex] || '0', 10) || 0,
    }));
}

const rows = parseTopics(csv);
const maxVolume = Math.max(...rows.map((row) => row.volume), 1);
const logMaxVolume = Math.log1p(maxVolume);

function volumeScore(volume: number) {
  return Math.round((Math.log1p(volume) / logMaxVolume) * 100);
}

export const top500Topics: TopicRecord[] = rows.map((row) => {
  const engagementScore = volumeScore(row.volume);

  return {
    id: row.id,
    name: row.name,
    type: 'topic',
    taxonomy: 'Topic',
    approved: true,
    coverageScore: 0,
    engagementScore,
    momentumScore: 0,
    confidenceScore: 0,
    taggedContentCount: row.volume,
    totalContentCount: row.volume,
    freshVolume: row.volume,
    velocity: 0,
    editorialBoost: 0,
    hotTopicRadar: false,
    discoverable: false,
    recommendable: false,
    lastUpdated: '2026-04-01T00:00:00Z',
    linkedEntities: [],
    existingPages: [],
    representativeContent: [],
  };
});
