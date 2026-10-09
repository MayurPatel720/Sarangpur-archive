import { z, type ZodType } from 'zod';
import {
  activityResponseSchema,
  alertsResponseSchema,
  blocksResponseSchema,
  pipelineResponseSchema,
  summaryResponseSchema,
  type ActivityResponse,
  type AlertsResponse,
  type BlocksResponse,
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
  type UserPickerResponse,
  type UserResponse,
  type UsersResponse,
  userPickerResponseSchema,
} from '@/types/admin';
import {
  decisionResponseSchema,
  lotCreateResponseSchema,
  lotDetailResponseSchema,
  lotListResponseSchema,
  lotMediaLinesResponseSchema,
  lotPickupResponseSchema,
  lotPatchResponseSchema,
  overrideResponseSchema,
  submitResponseSchema,
  type DecisionBody,
  type DecisionResponse,
  type LotCreateBody,
  type LotDetailResponse,
  type LotListResponse,
  type LotMediaLinesBody,
  type LotPickupBody,
  type LotPickupResponse,
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
import {
  itemDispositionDoneResponseSchema,
  itemDispositionListSchema,
  itemsBulkResponseSchema,
  codeInfoResponseSchema,
  columnsResponseSchema,
  itemDuplicateResponseSchema,
  itemNumberResponseSchema,
  itemOrderResponseSchema,
  sheetCodeResponseSchema,
  itemsGridResponseSchema,
  type ItemDispositionDoneBody,
  type ItemDispositionList,
  type ItemsBulkBody,
  type ItemsBulkResponse,
  type CodeInfoResponse,
  type ColumnsBody,
  type ColumnsResponse,
  type ItemDuplicateBody,
  type ItemDuplicateResponse,
  type ItemNumberBody,
  type ItemOrderBody,
  type SheetCodeBody,
  type SheetCodeResponse,
  type ItemsGridResponse,
} from '@/types/items';
import { masterResponseSchema, type MasterResponse } from '@/types/master';
import {
  searchResponseSchema,
  type SearchResponse,
} from '@/types/search';
import {
  itemCreateResponseSchema,
  lotProjectsResponseSchema,
  projectAssignResponseSchema,
  projectCreateResponseSchema,
  projectDetailResponseSchema,
  projectListResponseSchema,
  projectUpdateResponseSchema,
  type ItemCreateInput,
  type ProjectAddMediaInput,
  type ItemCreateResponse,
  type LotProjectsResponse,
  type ProjectAssignResponse,
  type ProjectCreateInput,
  type ProjectCreateResponse,
  type ProjectDetailResponse,
  type ProjectListResponse,
  type ProjectUpdateBody,
  type ProjectUpdateResponse,
} from '@/types/project';
import {
  projectImageDeleteResponseSchema,
  projectImageResponseSchema,
  projectImagesResponseSchema,
  type ProjectImagePatchBody,
  type ProjectImageResponse,
  type ProjectImagesResponse,
} from '@/types/project-image';
import {
  triageBulkResponseSchema,
  triageItemsResponseSchema,
  type TriageBulkBody,
  type TriageBulkResponse,
  type TriageItemsResponse,
} from '@/types/triage';

import {
  returnRecordResponseSchema,
  returnsResponseSchema,
  type ReturnRecordBody,
  type ReturnRecordResponse,
  type ReturnsResponse,
} from '@/types/returns';
import {
  taskAttachmentResponseSchema,
  taskDetailResponseSchema,
  taskListResponseSchema,
  taskMutationResponseSchema,
  taskPanelResponseSchema,
  type TaskAttachment,
  type TaskChecklistBody,
  type TaskCommentBody,
  type TaskPersonalCreateInput,
  type TaskPersonalUpdateBody,
  type TaskCreateInput,
  type TaskDetailResponse,
  type TaskListResponse,
  type TaskPanelResponse,
  type TaskStatusBody,
  type TaskUpdateBody,
} from '@/types/task';
import {
  notificationListResponseSchema,
  notificationReadResponseSchema,
  type NotificationListResponse,
  type NotificationReadBody,
  type NotificationReadResponse,
} from '@/types/notification';

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

/** `?format=x` for format-scoped dashboard reads; '' keeps the global URL. */
function formatQuery(format?: string): string {
  return format ? `?format=${encodeURIComponent(format)}` : '';
}

export const dashboardApi = {
  blocks: () => getJson<BlocksResponse>('/api/dashboard/blocks', blocksResponseSchema),
  summary: (format?: string) =>
    getJson<SummaryResponse>(`/api/dashboard/summary${formatQuery(format)}`, summaryResponseSchema),
  pipeline: (format?: string) =>
    getJson<PipelineResponse>(`/api/dashboard/pipeline${formatQuery(format)}`, pipelineResponseSchema),
  alerts: (format?: string) =>
    getJson<AlertsResponse>(`/api/dashboard/alerts${formatQuery(format)}`, alertsResponseSchema),
  activity: (limit = 8, format?: string) =>
    getJson<ActivityResponse>(
      `/api/dashboard/activity?limit=${limit}${format ? `&format=${encodeURIComponent(format)}` : ''}`,
      activityResponseSchema,
    ),
};

export const healthApi = {
  status: () => getJson<ServerHealthResponse>('/api/health', serverHealthResponseSchema),
};

async function sendJson<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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
  picker: () =>
    getJson<UserPickerResponse>('/api/users/picker', userPickerResponseSchema),
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
  /** Private Newly arrived / Lots flag for one of the caller's own lots. */
  setPickup: (body: LotPickupBody) =>
    sendJson<LotPickupResponse>('/api/lots/pickup', 'POST', body, lotPickupResponseSchema),
  replaceMediaLines: (id: string, body: LotMediaLinesBody) =>
    sendJson<{ id: string; lotReference: string; quantity: number; version: number }>(
      `/api/lots/${encodeURIComponent(id)}/media-lines`,
      'PUT',
      body,
      lotMediaLinesResponseSchema,
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
  triageItems: (id: string) =>
    getJson<TriageItemsResponse>(
      `/api/lots/${encodeURIComponent(id)}/triage`,
      triageItemsResponseSchema,
    ),
  recordTriage: (id: string, body: TriageBulkBody) =>
    sendJson<TriageBulkResponse>(
      `/api/lots/${encodeURIComponent(id)}/decision/triage`,
      'POST',
      body,
      triageBulkResponseSchema,
    ),  requestOverride: (id: string, body: OverrideRequestBody) =>
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
  projects: (id: string) =>
    getJson<LotProjectsResponse>(
      `/api/lots/${encodeURIComponent(id)}/projects`,
      lotProjectsResponseSchema,
    ),
  createItem: (id: string, body: ItemCreateInput) =>
    sendJson<ItemCreateResponse>(
      `/api/lots/${encodeURIComponent(id)}/items`,
      'POST',
      body,
      itemCreateResponseSchema,
    ),
};

export const searchApi = {
  global: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return getJson<SearchResponse>(`/api/search${qs ? `?${qs}` : ''}`, searchResponseSchema);
  },
};

/** `?format=x` keeps a queue read inside its format block; absent = global queue. */
function queueUrl(queue: string, page: number, pageSize: number, format?: string): string {
  return `/api/queues/${queue}?page=${page}&pageSize=${pageSize}${
    format ? `&format=${encodeURIComponent(format)}` : ''
  }`;
}

export const queuesApi = {
  returns: (page: number, pageSize: number, format?: string) =>
    getJson<LotListResponse>(queueUrl('returns', page, pageSize, format), lotListResponseSchema),
  discards: (page: number, pageSize: number, format?: string) =>
    getJson<LotListResponse>(queueUrl('discards', page, pageSize, format), lotListResponseSchema),
};

export const itemsGridApi = {
  get: (lotId: string) =>
    getJson<ItemsGridResponse>(`/api/lots/${encodeURIComponent(lotId)}/items/grid`, itemsGridResponseSchema),
  update: (lotId: string, body: ItemsBulkBody) =>
    sendJson<ItemsBulkResponse>(
      `/api/lots/${encodeURIComponent(lotId)}/items/grid`,
      'PATCH',
      body,
      itemsBulkResponseSchema,
    ),
  codeInfo: (lotId: string, abbr1: string, abbr2: string) =>
    getJson<CodeInfoResponse>(
      `/api/lots/${encodeURIComponent(lotId)}/items/codes?${new URLSearchParams({ abbr1, abbr2 })}`,
      codeInfoResponseSchema,
    ),
  recodeSheet: (lotId: string, body: SheetCodeBody) =>
    sendJson<SheetCodeResponse>(`/api/lots/${encodeURIComponent(lotId)}/items/codes`, 'PATCH', body, sheetCodeResponseSchema),
  setNumber: (lotId: string, body: ItemNumberBody) =>
    sendJson<{ code: string }>(`/api/lots/${encodeURIComponent(lotId)}/items/code`, 'PATCH', body, itemNumberResponseSchema),
  markDuplicate: (lotId: string, body: ItemDuplicateBody) =>
    sendJson<ItemDuplicateResponse>(`/api/lots/${encodeURIComponent(lotId)}/items/duplicate`, 'POST', body, itemDuplicateResponseSchema),
  reorder: (lotId: string, body: ItemOrderBody) =>
    sendJson<{ updated: number }>(`/api/lots/${encodeURIComponent(lotId)}/items/order`, 'PATCH', body, itemOrderResponseSchema),
  columns: (lotId: string, body: ColumnsBody) =>
    sendJson<ColumnsResponse>(`/api/lots/${encodeURIComponent(lotId)}/items/columns`, 'PATCH', body, columnsResponseSchema),
  dispositions: (kind: 'return' | 'discard', status: 'pending' | 'done', page: number, pageSize: number) =>
    getJson<ItemDispositionList>(
      `/api/queues/item-dispositions?${new URLSearchParams({ kind, status, page: String(page), pageSize: String(pageSize) })}`,
      itemDispositionListSchema,
    ),
  markDone: (body: ItemDispositionDoneBody) =>
    sendJson<{ updated: number }>('/api/items/dispositions', 'POST', body, itemDispositionDoneResponseSchema),
};

export const masterApi = {
  list: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return getJson<MasterResponse>(`/api/items/master?${qs}`, masterResponseSchema);
  },
};

export const projectsApi = {
  list: (page: number, pageSize: number, search?: string, assignee?: string) => {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(search ? { search } : {}),
      ...(assignee ? { assignee } : {}),
    }).toString();
    return getJson<ProjectListResponse>(`/api/projects?${qs}`, projectListResponseSchema);
  },
  create: (body: ProjectCreateInput) =>
    sendJson<ProjectCreateResponse>('/api/projects', 'POST', body, projectCreateResponseSchema),
  detail: (id: string, lotPage: number, lotPageSize: number) =>
    getJson<ProjectDetailResponse>(
      `/api/projects/${encodeURIComponent(id)}?lotPage=${lotPage}&lotPageSize=${lotPageSize}`,
      projectDetailResponseSchema,
    ),
  update: (id: string, body: ProjectUpdateBody) =>
    sendJson<ProjectUpdateResponse>(
      `/api/projects/${encodeURIComponent(id)}`,
      'PATCH',
      body,
      projectUpdateResponseSchema,
    ),
  assignLot: (projectId: string, lotId: string, assigneeId?: string) =>
    sendJson<ProjectAssignResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/lots`,
      'POST',
      { lotId, ...(assigneeId ? { assigneeId } : {}) },
      projectAssignResponseSchema,
    ),
  addMedia: (projectId: string, body: ProjectAddMediaInput) =>
    sendJson<{ lots: { id: string; lotReference: string; format: string; created: boolean }[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/media`,
      'POST',
      body,
      z.object({
        lots: z.array(
          z.object({ id: z.string(), lotReference: z.string(), format: z.string(), created: z.boolean() }),
        ),
      }),
    ),
  setAssignee: (lotId: string, assigneeId: string | null) =>
    sendJson<{ lotId: string; assigneeId: string | null; assigneeName: string | null }>(
      `/api/lots/${encodeURIComponent(lotId)}/assignee`,
      'PUT',
      { assigneeId },
      z.object({ lotId: z.string(), assigneeId: z.string().nullable(), assigneeName: z.string().nullable() }),
    ),
  unassignLot: (projectId: string, lotId: string) =>
    sendJson<ProjectAssignResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/lots/${encodeURIComponent(lotId)}`,
      'DELETE',
      {},
      projectAssignResponseSchema,
    ),
};

/** Multipart send (photo upload / replace). The browser sets the boundary header itself. */
async function sendForm<T>(
  path: string,
  method: 'POST' | 'PUT',
  form: FormData,
  schema: ZodType<T>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: { accept: 'application/json' }, body: form });
  } catch {
    throw new ApiRequestError(0, 'Network error — check your connection and retry.');
  }
  if (!res.ok) {
    let message = res.status === 413 ? 'That photo is too large to upload.' : `Request failed with ${res.status}`;
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

export const projectImagesApi = {
  list: (projectId: string) =>
    getJson<ProjectImagesResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/images`,
      projectImagesResponseSchema,
    ),
  upload: (projectId: string, form: FormData) =>
    sendForm<ProjectImageResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/images`,
      'POST',
      form,
      projectImageResponseSchema,
    ),
  update: (projectId: string, imageId: string, body: ProjectImagePatchBody) =>
    sendJson<ProjectImageResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`,
      'PATCH',
      body,
      projectImageResponseSchema,
    ),
  replace: (projectId: string, imageId: string, form: FormData) =>
    sendForm<ProjectImageResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`,
      'PUT',
      form,
      projectImageResponseSchema,
    ),
  remove: (projectId: string, imageId: string) =>
    sendJson<{ ok: true }>(
      `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`,
      'DELETE',
      {},
      projectImageDeleteResponseSchema,
    ),
};

const qs = (params: Record<string, string>) => {
  const q = new URLSearchParams(params).toString();
  return q ? `?${q}` : '';
};

export const returnsApi = {
  list: (params: Record<string, string>) =>
    getJson<ReturnsResponse>(`/api/returns${qs(params)}`, returnsResponseSchema),
  record: (body: ReturnRecordBody) =>
    sendJson<ReturnRecordResponse>('/api/returns/record', 'POST', body, returnRecordResponseSchema),
};

export const tasksApi = {
  list: (params: Record<string, string>) =>
    getJson<TaskListResponse>(`/api/tasks${qs(params)}`, taskListResponseSchema),
  panel: (params: Record<string, string>) =>
    getJson<TaskPanelResponse>(`/api/tasks/panel${qs(params)}`, taskPanelResponseSchema),
  detail: (id: string, today: string) =>
    getJson<TaskDetailResponse>(
      `/api/tasks/${encodeURIComponent(id)}${qs({ today })}`,
      taskDetailResponseSchema,
    ),
  create: (body: TaskCreateInput) =>
    sendJson<TaskDetailResponse>('/api/tasks', 'POST', body, taskMutationResponseSchema),
  update: (id: string, body: TaskUpdateBody) =>
    sendJson<TaskDetailResponse>(
      `/api/tasks/${encodeURIComponent(id)}`,
      'PATCH',
      body,
      taskMutationResponseSchema,
    ),
  setStatus: (id: string, body: TaskStatusBody) =>
    sendJson<TaskDetailResponse>(
      `/api/tasks/${encodeURIComponent(id)}/status`,
      'POST',
      body,
      taskMutationResponseSchema,
    ),
  comment: (id: string, body: TaskCommentBody) =>
    sendJson<TaskDetailResponse>(
      `/api/tasks/${encodeURIComponent(id)}/comments`,
      'POST',
      body,
      taskMutationResponseSchema,
    ),
  /** My to-do: private to-dos for the signed-in user. */
  createMine: (body: TaskPersonalCreateInput) =>
    sendJson<TaskDetailResponse>('/api/tasks/mine', 'POST', body, taskMutationResponseSchema),
  updateMine: (id: string, body: TaskPersonalUpdateBody) =>
    sendJson<TaskDetailResponse>(
      `/api/tasks/mine/${encodeURIComponent(id)}`,
      'PATCH',
      body,
      taskMutationResponseSchema,
    ),
  deleteMine: (id: string) =>
    sendJson<{ ok: true }>(`/api/tasks/mine/${encodeURIComponent(id)}`, 'DELETE', {}, z.object({ ok: z.literal(true) })),
  /** Comment images: upload one (multipart), or drop one that was never posted. */
  uploadImage: (id: string, form: FormData) =>
    sendForm<TaskAttachment>(
      `/api/tasks/${encodeURIComponent(id)}/attachments`,
      'POST',
      form,
      taskAttachmentResponseSchema,
    ),
  discardImage: (id: string, publicId: string) =>
    sendJson<{ ok: true }>(
      `/api/tasks/${encodeURIComponent(id)}/attachments`,
      'DELETE',
      { publicId },
      z.object({ ok: z.literal(true) }),
    ),
  setChecklist: (id: string, body: TaskChecklistBody) =>
    sendJson<TaskDetailResponse>(
      `/api/tasks/${encodeURIComponent(id)}/checklist`,
      'PUT',
      body,
      taskMutationResponseSchema,
    ),
};

export const notificationsApi = {
  list: (page = 1, pageSize = 15) =>
    getJson<NotificationListResponse>(
      `/api/notifications${qs({ page: String(page), pageSize: String(pageSize) })}`,
      notificationListResponseSchema,
    ),
  markRead: (body: NotificationReadBody) =>
    sendJson<NotificationReadResponse>(
      '/api/notifications/read',
      'POST',
      body,
      notificationReadResponseSchema,
    ),
};
