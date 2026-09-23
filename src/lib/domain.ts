/**
 * Domain vocabulary for the Sarangpur Archive Program.
 *
 * Every string literal here comes from the developer brief. Keep this file as the
 * single source of truth — the Mongoose schemas, the Zod response contracts and the
 * UI all derive their unions from these arrays, so adding a stage or a discard reason
 * is a one-line change that the type checker then propagates.
 */

/** The eight stages a lot moves through, in pipeline order. */
export const STAGES = [
  'intake',
  'decision',
  'metadata',
  'scanning',
  'mls_tag',
  'storage',
  'returned',
  'discarded',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  intake: 'Intake',
  decision: 'Decision',
  metadata: 'Metadata',
  scanning: 'Scanning',
  mls_tag: 'MLS tag',
  storage: 'Storage',
  returned: 'Returned',
  discarded: 'Discarded',
};

/**
 * Stages where the lot is still being worked on. A lot sitting in one of these is
 * occupying somebody's queue right now, so the board counts current occupancy.
 */
export const IN_FLIGHT_STAGES: Stage[] = [
  'intake',
  'decision',
  'metadata',
  'scanning',
  'mls_tag',
];

/**
 * Terminal stages. A lot that reaches one of these is finished, so counting current
 * occupancy would be meaningless — after a few years `storage` would hold almost every
 * lot in the archive. The board instead counts how many *entered* the stage inside the
 * reporting window, which is what an operations board is actually asking.
 */
export const TERMINAL_STAGES: Stage[] = ['storage', 'returned', 'discarded'];

/** The eight columns drawn on the pipeline board, in order. */
export const BOARD_STAGES: Stage[] = [...IN_FLIGHT_STAGES, ...TERMINAL_STAGES];

export const DECISIONS = ['pending', 'archive', 'return', 'discard'] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_LABELS: Record<Decision, string> = {
  pending: 'Pending',
  archive: 'Archive',
  return: 'Return',
  discard: 'Discard',
};

export const FORMATS = ['photo', 'video', 'audio', 'documents', 'prasadi'] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<Format, string> = {
  photo: 'Photo',
  video: 'Video',
  audio: 'Audio',
  documents: 'Documents',
  prasadi: 'Prasadi',
};

export const DATA_TYPES = ['physical', 'digital'] as const;
export type DataType = (typeof DATA_TYPES)[number];

export const DATA_TYPE_LABELS: Record<DataType, string> = {
  physical: 'Physical',
  digital: 'Digital',
};

export const SCAN_STATUSES = ['pending', 'in_progress', 'scanned', 'cannot_scan'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const RETURN_FORMATS = ['physical', 'digital', 'both', 'none'] as const;
export type ReturnFormat = (typeof RETURN_FORMATS)[number];

export const RETURN_STATUSES = ['not_requested', 'pending', 'in_progress', 'returned'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const ROLES = ['volunteer', 'reviewer', 'lead_reviewer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  volunteer: 'Volunteer',
  reviewer: 'Reviewer',
  lead_reviewer: 'Lead Reviewer',
  admin: 'Admin',
};

export const OVERRIDE_STATUSES = ['none', 'requested', 'approved', 'rejected'] as const;
export type OverrideStatus = (typeof OVERRIDE_STATUSES)[number];

export const DISCARD_REASONS = [
  'duplicate',
  'not_scannable',
  'not_significant',
  'condition_too_poor',
  'other',
] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

export const NOT_DIGITIZED_REASONS = [
  'duplicate_in_mls',
  'condition_too_poor',
  'not_significant',
  'other',
] as const;
export type NotDigitizedReason = (typeof NOT_DIGITIZED_REASONS)[number];

export const NOT_DIGITIZED_REASON_LABELS: Record<NotDigitizedReason, string> = {
  duplicate_in_mls: 'Duplicate of an item already in MLS',
  condition_too_poor: 'Condition too poor to scan',
  not_significant: 'Not historically significant',
  other: 'Other, recorded at intake',
};

/** Activity log event kinds. `severity` decides the dot colour in the feed. */
export const ACTIVITY_KINDS = [
  'intake_created',
  'intake_updated',
  'submitted_for_decision',
  'decision_recorded',
  'override_requested',
  'override_approved',
  'override_rejected',
  'code_issued',
  'scan_started',
  'scan_completed',
  'folder_path_recorded',
  'mls_duplicate_flagged',
  'mls_tagged',
  'return_recorded',
  'return_completed',
  'reconciliation_mismatch',
  'duplicate_resolved',
  'discard_confirmed',
  'discard_reversed',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type Severity = 'neutral' | 'info' | 'good' | 'warning' | 'critical';

export const ACTIVITY_SEVERITY: Record<ActivityKind, Severity> = {
  intake_created: 'neutral',
  intake_updated: 'neutral',
  submitted_for_decision: 'info',
  decision_recorded: 'good',
  override_requested: 'warning',
  override_approved: 'good',
  override_rejected: 'neutral',
  code_issued: 'info',
  scan_started: 'neutral',
  scan_completed: 'good',
  folder_path_recorded: 'info',
  mls_duplicate_flagged: 'critical',
  mls_tagged: 'good',
  return_recorded: 'neutral',
  return_completed: 'good',
  reconciliation_mismatch: 'warning',
  duplicate_resolved: 'info',
  discard_confirmed: 'critical',
  discard_reversed: 'warning',
};

/**
 * Naming-code origin sources. Per the brief, Print format with no Mandir origin uses OTH.
 */
export const ORIGIN_SOURCES = ['MUM', 'AHM', 'SAR', 'OTH'] as const;
export type OriginSource = (typeof ORIGIN_SOURCES)[number];

export const ORIGIN_LABELS: Record<OriginSource, string> = {
  MUM: 'Mumbai Mandir',
  AHM: 'Ahmedabad Mandir',
  SAR: 'Sarangpur Mandir',
  OTH: 'No Mandir origin',
};

/** Format prefixes used in the naming code, e.g. NEG-MUM-014. */
export const CODE_PREFIXES = ['NEG', 'PRT', 'SLD', 'VHS', 'AUD', 'DIG'] as const;
export type CodePrefix = (typeof CODE_PREFIXES)[number];
