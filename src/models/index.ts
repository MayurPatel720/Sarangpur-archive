/**
 * Importing this module registers every Mongoose model exactly once.
 *
 * Route handlers should import from here rather than reaching for an individual model
 * file, so that `populate()` never fails with MissingSchemaError because a referenced
 * model had not been registered yet.
 */
export { User, type UserDoc } from './User';
export { ArchiveLot, type ArchiveLotDoc } from './ArchiveLot';
export { LotItem, type LotItemDoc } from './LotItem';
export { ActivityLog, type ActivityLogDoc } from './ActivityLog';
