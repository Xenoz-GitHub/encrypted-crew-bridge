import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function validateAesKey(value: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('AES_KEY must be exactly 64 hex characters (32 bytes)');
  }
}

const rawKey = requireEnv('AES_KEY');
validateAesKey(rawKey);

export const env = {
  AES_KEY: rawKey,
  ADMIN_PASSWORD: requireEnv('ADMIN_PASSWORD'),
  WORKSPACE_ROOT: path.resolve(requireEnv('WORKSPACE_ROOT')),
  PORT: parseInt(process.env.PORT || '3100', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
} as const;
