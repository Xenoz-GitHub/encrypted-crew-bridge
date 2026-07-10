import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_BYTES = 32;

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

function parseKey(hex: string): Buffer {
  if (hex.length !== KEY_BYTES * 2) {
    throw new CryptoError(`AES_KEY must be ${KEY_BYTES * 2} hex characters (got ${hex.length})`);
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: Buffer, keyHex: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const key = parseKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer, keyHex: string): Buffer {
  const key = parseKey(keyHex);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
