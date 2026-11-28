import { hostname } from 'node:os';
import { connectToDatabase } from '@/lib/mongo';
import { Setting } from '@/models/Setting';

/**
 * Where photos are saved, decided at run time. The admin sets it in Settings → Photo storage (kept in the `settings` document);
 * when nothing is saved there the server environment (STORAGE_DRIVER / MEDIA_ROOT) decides, so existing setups keep working.
 * Changing it needs no restart: the value is re-read from the database (cached a few seconds, cleared on save).
 */

export type PhotoDriver = 'cloudinary' | 'disk';

export interface StorageConfig {
  driver: PhotoDriver;
  /** The folder photos are written to (disk driver). Empty when not set. */
  root: string;
  /** Earlier folders; photos saved there are still found. */
  legacyRoots: string[];
  /** Where the effective values came from. */
  source: 'settings' | 'environment';
}

interface StoredStorage {
  photoStorageDriver?: string | null;
  photoStorageRoot?: string | null;
  photoStorageLegacyRoots?: string[] | null;
}

/** Pure: the effective config from a settings document (or nothing) plus the environment. */
export function effectiveStorage(doc: StoredStorage | null | undefined, env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const saved = doc?.photoStorageDriver === 'cloudinary' || doc?.photoStorageDriver === 'disk' ? doc.photoStorageDriver : null;
  const driver: PhotoDriver = saved ?? (env.STORAGE_DRIVER === 'disk' ? 'disk' : 'cloudinary');
  const savedRoot = doc?.photoStorageRoot?.trim() ?? '';
  return {
    driver,
    root: savedRoot || (env.MEDIA_ROOT?.trim() ?? ''),
    legacyRoots: (doc?.photoStorageLegacyRoots ?? []).filter(Boolean),
    source: saved ? 'settings' : 'environment',
  };
}

const TTL_MS = 10_000;
let cached: { at: number; value: StorageConfig } | null = null;

/** The live config (database over environment). Cached briefly so every photo request does not hit the database. */
export async function getStorageConfig(): Promise<StorageConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value: StorageConfig;
  try {
    await connectToDatabase();
    const doc = await Setting.findOne({ key: 'global' }).select('photoStorageDriver photoStorageRoot photoStorageLegacyRoots').lean();
    value = effectiveStorage(doc);
  } catch {
    value = effectiveStorage(null); // database unreachable: fall back to the environment instead of failing every photo
  }
  cached = { at: Date.now(), value };
  return value;
}

/** Called after the settings are saved so the new choice applies at once on this server. */
export function clearStorageConfigCache(): void {
  cached = null;
}

/** Which machine this app is running on, so the Settings screen can say what its folder list is showing. */
export interface ServerInfo {
  os: 'Windows' | 'Linux' | 'macOS' | 'Other';
  name: string;
  /** True on a cloud host (Vercel, AWS Lambda): there is no persistent folder there, and it cannot reach a PC or file share. */
  hosted: boolean;
}

export function describeServer(): ServerInfo {
  const os = process.platform === 'win32' ? 'Windows' : process.platform === 'linux' ? 'Linux' : process.platform === 'darwin' ? 'macOS' : 'Other';
  const hosted = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
  return { os, name: hosted ? 'cloud host' : hostname(), hosted };
}
