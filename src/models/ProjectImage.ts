import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { FORMATS } from '@/lib/domain';

/**
 * A photo of the physical items of a PROJECT, stored in Cloudinary. The database
 * holds metadata only. `uploadedByName` is denormalised at write time and never
 * back-filled (same contract as `ActivityLog.actorName`).
 */
const projectImageSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    url: { type: String, required: true, trim: true },
    /** Cloudinary public_id: what destroy() needs to remove the asset. */
    publicId: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    caption: { type: String, trim: true, default: '' },
    format: { type: String, enum: [...FORMATS], default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedByName: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'projectimages' },
);

projectImageSchema.index({ project: 1, createdAt: -1 });

export type ProjectImageDoc = InferSchemaType<typeof projectImageSchema>;

export const ProjectImage: Model<ProjectImageDoc> =
  (models.ProjectImage as Model<ProjectImageDoc>) ??
  model<ProjectImageDoc>('ProjectImage', projectImageSchema);
