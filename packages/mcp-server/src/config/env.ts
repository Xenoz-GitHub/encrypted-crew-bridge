import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const aesKey = process.env.AES_KEY || crypto.randomBytes(32).toString('hex');

export const env = {
  AES_KEY: aesKey,
  WORKSPACE_ROOT: path.resolve(process.env.WORKSPACE_ROOT || '../..'),
  PORT: parseInt(process.env.PORT || '3100', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
} as const;
