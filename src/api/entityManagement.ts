const ENTITY_MANAGEMENT_BASE_URL =
  import.meta.env.VITE_ENTITY_MANAGEMENT_BASE_URL ||
  (import.meta.env.DEV
    ? '/ems'
    : 'https://entity-management-service.us-east-2.cnt-entity.prod.cloud.siriusxm.com');

export interface EntityManagementEntity {
  id: string;
  name?: string;
  shortName?: string;
  approvalStatus?: string;
  accessControls?: {
    default?: {
      discoverable?: boolean;
      recommendable?: boolean;
      visible?: boolean;
    };
  };
}

export interface EntityManagementSearchResult {
  entityId?: string;
  sourceId?: string;
  type: string;
  name: string;
  description?: string;
  tileImage1x1?: string;
}

interface EntityManagementSearchResponse {
  entities?: EntityManagementSearchResult[];
  paginationToken?: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ENTITY_MANAGEMENT_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Entity Management ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function encodeEntityPathId(id: string) {
  return encodeURIComponent(id).replace(/%3A/gi, ':');
}

export async function fetchEntityManagementEntity(id: string) {
  return getJson<EntityManagementEntity>(`/internal/v1/entities/${encodeEntityPathId(id)}`);
}

export async function fetchEntityManagementSearch(query: string) {
  const params = new URLSearchParams();
  params.set('query', query);
  ['talent', 'brand', 'team', 'league', 'genre'].forEach((type) => params.append('types', type));
  params.set('from', '0');
  params.set('size', '30');

  const data = await getJson<EntityManagementSearchResponse>(`/internal/v1/entities/search?${params.toString()}`);
  return data.entities || [];
}
