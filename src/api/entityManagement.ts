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
