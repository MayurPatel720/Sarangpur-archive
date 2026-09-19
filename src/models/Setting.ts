import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * Global settings, a single document with `key: 'global'`.
 *
 * Moves the alert thresholds out of env vars so an admin can change them in the UI.
 * Env vars stay as the fallback when the document is absent. Updated with optimistic
 * concurrency on `revision` so two admins cannot silently overwrite each other.
 */
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    decisionPendingDays: { type: Number, required: true, default: 5, min: 1 },
    scanStuckDays: { type: Number, required: true, default: 7, min: 1 },
    returnGraceDays: { type: Number, required: true, default: 3, min: 0 },
    storageCapacityTb: { type: Number, required: true, default: 50, min: 1 },
    // Storage identity shown in the sidebar tile. usedTb is a manually maintained
    // figure until the storage-inventory job exists; the tile labels it honestly.
    storageLabel: { type: String, required: true, default: 'MLS reachable' },
    storageRoot: { type: String, required: true, default: '192.168.0.84/MLS/dev/' },
    storageUsedTb: { type: Number, required: true, default: 0, min: 0 },
    notifyEmailEnabled: { type: Boolean, required: true, default: false },
    notifySmsEnabled: { type: Boolean, required: true, default: false },
    revision: { type: Number, required: true, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'settings' },
);

export type SettingDoc = InferSchemaType<typeof settingSchema>;

export const Setting: Model<SettingDoc> =
  (models.Setting as Model<SettingDoc>) ?? model<SettingDoc>('Setting', settingSchema);
