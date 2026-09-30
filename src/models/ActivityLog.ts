import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { ACTIVITY_KINDS } from '@/lib/domain';

/**
 * Append-only audit trail. Every status change and field update lands here with the
 * acting user and a timestamp.
 *
 * Two things worth knowing:
 *
 *  1. `actorName` and `lotCode` are denormalised copies. The activity feed is the most
 *     frequently read query in the system and this removes two $lookups from it. They
 *     are written once at insert time and never updated — an audit entry is supposed to
 *     record what was true at the moment it happened, so a later rename must not
 *     rewrite history.
 *
 *  2. `actor` is null for events the system raised itself (code issuance, duplicate
 *     detection, reconciliation).
 *
 *  3. `mediaSubtype` / `mediaLineIndex` tag entries that belong to one media
 *     line of a multi-line lot (e.g. each line's `intake_created` entry), so
 *     the activity tab can group the trail per media type. Lot-wide events
 *     leave both null and render under "General". Like `actorName`/`lotCode`
 *     they are written once and never back-filled.
 */
const activityLogSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true, index: true },
    lotCode: { type: String, required: true, trim: true },

    kind: { type: String, required: true, enum: ACTIVITY_KINDS, index: true },
    title: { type: String, required: true, trim: true },
    detail: { type: String, trim: true },

    /** Denormalised media tag for per-media-type activity grouping. Null = lot-wide. */
    mediaSubtype: { type: String, trim: true, default: null, index: true },
    mediaLineIndex: { type: Number, default: null },

    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, required: true, trim: true, default: 'System' },

    at: { type: Date, required: true, index: true },

    /** Optional before/after for field-level changes. */
    changes: {
      type: [
        new Schema(
          {
            field: { type: String, required: true },
            from: { type: Schema.Types.Mixed, default: null },
            to: { type: Schema.Types.Mixed, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { collection: 'activitylogs' },
);

activityLogSchema.index({ at: -1 }); // global recent activity
activityLogSchema.index({ lot: 1, at: -1 }); // per-record audit trail

export type ActivityLogDoc = InferSchemaType<typeof activityLogSchema>;

export const ActivityLog: Model<ActivityLogDoc> =
  (models.ActivityLog as Model<ActivityLogDoc>) ??
  model<ActivityLogDoc>('ActivityLog', activityLogSchema);
