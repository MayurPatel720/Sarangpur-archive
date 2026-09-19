import type { ZodType } from 'zod';
import {
  activityResponseSchema,
  alertsResponseSchema,
  pipelineResponseSchema,
  summaryResponseSchema,
  type ActivityResponse,
  type AlertsResponse,
  type PipelineResponse,
  type SummaryResponse,
} from '@/types/dashboard';
import { serverHealthResponseSchema, type ServerHealthResponse } from '@/types/health';
import {
  listDeleteResponseSchema,
  listResponseSchema,
  listsResponseSchema,
  meResponseSchema,
  referenceLookupResponseSchema,
  roleResponseSchema,
  rolesListResponseSchema,
  settingsResponseSchema,
  userResponseSchema,
  usersResponseSchema,
  type ListCreateBody,
  type ListDeleteResponse,
  type ListPatchBody,
  type ListResponse,
  type ListsResponse,
  type MeResponse,
  type ReferenceLookupResponse,
  type RoleCreateBody,
  type RolePatchBody,
  type RoleResponse,
  type RolesListResponse,
  type SettingsPatchBody,
  type SettingsResponse,
  type UserCreateBody,
  type UserPatchBody,
  type UserResponse,
  type UsersResponse,
} from '@/types/admin';
import {
  decisionResponseSchema,
  lotCreateResponseSchema,
  lotDetailResponseSchema,
  lotListResponseSchema,
  lotPatchResponseSchema,
  overrideResponseSchema,
  submitResponseSchema,
  type DecisionBody,
  type DecisionResponse,
  type LotCreateBody,
  type LotDetailResponse,
  type LotListResponse,
  type LotPatchBody,
  type OverrideDecideBody,
  type OverrideRequestBody,
  type OverrideResponse,
  type SubmitResponse,
} from '@/types/lot';
import {
  activityResponseSchema as lotActivityResponseSchema,
  discardResponseSchema,
  duplicateResponseSchema,
  itemsResponseSchema,
  mlsResponseSchema,
  reconcileResponseSchema,
  returnResponseSchema,
  scanResponseSchema,
  type ActivityResponse as LotActivityResponse,
  type DiscardBody,
  type DiscardResponse,
  type DuplicateBody,
  type DuplicateResponse,
  type ItemsResponse,
  type MlsBody,
  type MlsResponse,
  type ReconcileResponse,
  type ReturnBody,
  type ReturnResponse,
  type ScanBody,
  type ScanResponse,
} from '@/types/ops';

/**
 * Thrown when a route returns a non-2xx. Carries the server's own message so the UI
 * can show "Cannot reach MongoDB…" rather than a generic failure.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly hint?: string;

  constructor(status: number, message: string, hint?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.hint = hint;
  }
}

async function getJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    let hint: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; hint?: string };
      if (body.error) message = body.error;
      hint = body.hint;
    } catch {
      /* the body was not JSON — keep the status message */
    }
    throw new ApiRequestError(res.status, message, hint);
  }

  // Parsing on the client too is cheap and turns a backend contract change into a
  // clear error here rather than an undefined deep inside a component.
  return schema.parse(await res.json());
}

export const dashboardApi = {
  summary: () => getJson<SummaryResponse>('/api/dashboard/summary', summaryResponseSchema),
  pipeline: () => getJson<PipelineResponse>('/api/dashboard/pipeline', pipelineResponseSchema),
  alerts: () => getJson<AlertsResponse>('/api/dashboard/alerts', alertsResponseSchema),
  activity: (limit = 8) =>
    getJson<ActivityResponse>(`/api/dashboard/activity?limit=${limit}`, activityResponseSchema),
};

export const healthApi = {
  status: () => getJson<ServerHealthResponse>('/api/health', serverHealthResponseSchema),
};

async function sendJson<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const parsed = (await res.json()) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* the body was not JSON — keep the status message */
    }
    throw new ApiRequestError(res.status, message);
  }

  return schema.parse(await res.json());
}

export const adminApi = {
  roles: () => getJson<RolesListResponse>('/api/admin/roles', rolesListResponseSchema),
  createRole: (body: RoleCreateBody) =>
    sendJson<RoleResponse>('/api/admin/roles', 'POST', body, roleResponseSchema),
  patchRole: (key: string, body: RolePatchBody) =>
    sendJson<RoleResponse>(
      `/api/admin/roles/${encodeURIComponent(key)}`,
      'PATCH',
      body,
      roleResponseSchema,
    ),

  lists: () => getJson<ListsResponse>('/api/admin/lists', listsResponseSchema),
  createList: (body: ListCreateBody) =>
    sendJson<ListResponse>('/api/admin/lists', 'POST', body, listResponseSchema),
  patchList: (key: string, body: ListPatchBody) =>
    sendJson<ListResponse>(
      `/api/admin/lists/${encodeURIComponent(key)}`,
      'PATCH',
      body,
      listResponseSchema,
    ),
  deleteList: (key: string) =>
    sendJson<ListDeleteResponse>(
      `/api/admin/lists/${encodeURIComponent(key)}`,
      'DELETE',
      {},
      listDeleteResponseSchema,
    ),

  users: () => getJson<UsersResponse>('/api/users', usersResponseSchema),
  createUser: (body: UserCreateBody) =>
    sendJson<UserResponse>('/api/users', 'POST', body, userResponseSchema),
  patchUser: (id: string, body: UserPatchBody) =>
    sendJson<UserResponse>(`/api/users/${encodeURIComponent(id)}`, 'PATCH', body, userResponseSchema),

  settings: () => getJson<SettingsResponse>('/api/admin/settings', settingsResponseSchema),
  patchSettings: (body: SettingsPatchBody) =>
    sendJson<SettingsResponse>('/api/admin/settings', 'PATCH', body, settingsResponseSchema),
};

export const referenceApi = {
  lookup: (key: string) =>
    getJson<ReferenceLookupResponse>(
      `/api/reference/${encodeURIComponent(key)}`,
      referenceLookupResponseSchema,
    ),
};

export const usersApi = {
  me: () => getJson<MeResponse>('/api/users/me', meResponseSchema),
};

export const lotsApi = {
  list: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return getJson<LotListResponse>(`/api/lots${qs ? `?${qs}` : ''}`, lotListResponseSchema);
  },
  create: (body: LotCreateBody) =>
    sendJson<{ id: string; lotReference: string; itemsCreated: number }>(
      '/api/lots',
      'POST',
      body,
      lotCreateResponseSchema,
    ),
  detail: (id: string) =>
    getJson<LotDetailResponse>(
      `/api/lots/${encodeURIComponent(id)}`,
      lotDetailResponseSchema,
    ),
  patch: (id: string, body: LotPatchBody) =>
    sendJson<{ id: string; lotReference: string; version: number }>(
      `/api/lots/${encodeURIComponent(id)}`,
      'PATCH',
      body,
      lotPatchResponseSchema,
    ),
  submit: (id: string) =>
    sendJson<SubmitResponse>(`/api/lots/${encodeURIComponent(id)}/submit`, 'POST', {}, submitResponseSchema),
  recordDecision: (id: string, body: DecisionBody) =>
    sendJson<DecisionResponse>(
      `/api/lots/${encodeURIComponent(id)}/decision`,
      'POST',
      body,
      decisionResponseSchema,
    ),
  requestOverride: (id: string, body: OverrideRequestBody) =>
    sendJson<OverrideResponse>(
      `/api/lots/${encodeURIComponent(id)}/override`,
      'POST',
      body,
      overrideResponseSchema,
    ),
  decideOverride: (id: string, body: OverrideDecideBody) =>
    sendJson<OverrideResponse>(
      `/api/lots/${encodeURIComponent(id)}/override`,
      'PATCH',
      body,
      overrideResponseSchema,
    ),
  scan: (id: string, body: ScanBody) =>
    sendJson<ScanResponse>(
      `/api/lots/${encodeURIComponent(id)}/scan`,
      'PATCH',
      body,
      scanResponseSchema,
    ),
  reconcile: (id: string) =>
    sendJson<ReconcileResponse>(
      `/api/lots/${encodeURIComponent(id)}/reconcile`,
      'POST',
      {},
      reconcileResponseSchema,
    ),
  tagMls: (id: string, body: MlsBody) =>
    sendJson<MlsResponse>(
      `/api/lots/${encodeURIComponent(id)}/mls`,
      'PATCH',
      body,
      mlsResponseSchema,
    ),
  resolveDuplicate: (id: string, body: DuplicateBody) =>
    sendJson<DuplicateResponse>(
      `/api/lots/${encodeURIComponent(id)}/mls/duplicate`,
      'PATCH',
      body,
      duplicateResponseSchema,
    ),
  manageReturn: (id: string, body: ReturnBody) =>
    sendJson<ReturnResponse>(
      `/api/lots/${encodeURIComponent(id)}/return`,
      'PATCH',
      body,
      returnResponseSchema,
    ),
  confirmDiscard: (id: string, body: DiscardBody) =>
    sendJson<DiscardResponse>(
      `/api/lots/${encodeURIComponent(id)}/discard`,
      'POST',
      body,
      discardResponseSchema,
    ),
  reverseDiscard: (id: string, version: number) =>
    sendJson<DiscardResponse>(
      `/api/lots/${encodeURIComponent(id)}/discard`,
      'DELETE',
      { version },
      discardResponseSchema,
    ),
  items: (id: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return getJson<ItemsResponse>(
      `/api/lots/${encodeURIComponent(id)}/items${qs ? `?${qs}` : ''}`,
      itemsResponseSchema,
    );
  },
  activity: (id: string, page: number, pageSize: number) =>
    getJson<LotActivityResponse>(
      `/api/lots/${encodeURIComponent(id)}/activity?page=${page}&pageSize=${pageSize}`,
      lotActivityResponseSchema,
    ),
};

export const queuesApi = {
  decision: (page: number, pageSize: number) =>
    getJson<LotListResponse>(
      `/api/queues/decision?page=${page}&pageSize=${pageSize}`,
      lotListResponseSchema,
    ),
  digitize: (page: number, pageSize: number) =>
    getJson<LotListResponse>(
      `/api/queues/digitize?page=${page}&pageSize=${pageSize}`,
      lotListResponseSchema,
    ),
  mls: (page: number, pageSize: number) =>
    getJson<LotListResponse>(
      `/api/queues/mls?page=${page}&pageSize=${pageSize}`,
      lotListResponseSchema,
    ),
  returns: (page: number, pageSize: number) =>
    getJson<LotListResponse>(
      `/api/queues/returns?page=${page}&pageSize=${pageSize}`,
      lotListResponseSchema,
    ),
  discards: (page: number, pageSize: number) =>
    getJson<LotListResponse>(
      `/api/queues/discards?page=${page}&pageSize=${pageSize}`,
      lotListResponseSchema,
    ),
};
