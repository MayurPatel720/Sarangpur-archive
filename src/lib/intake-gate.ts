/**
 * The Intake → Decision gate. A project child lot is created before anyone knows
 * the owner, origin or date, so those three must be filled before the lot may
 * leave Intake. Pure (no Mongoose) so the UI and the server share one rule.
 */
export interface IntakeGateInput {
  dateReceived?: Date | string | null;
  originSource?: string | null;
  owner?: { name?: string | null } | null;
}

export function intakeMissing(lot: IntakeGateInput): string[] {
  const missing: string[] = [];
  if (!lot.dateReceived) missing.push('Date received');
  if (!lot.originSource) missing.push('Origin source');
  if (!lot.owner?.name?.trim()) missing.push('Owner');
  return missing;
}
