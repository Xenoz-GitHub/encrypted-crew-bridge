import { encrypt, decrypt } from '../crypto/aes.js';
import { env } from '../config/env.js';
import { logInfo, logError } from '../utils/logger.js';

export class EncryptionService {
  private readonly key: string;

  constructor() {
    this.key = env.AES_KEY;
  }

  encryptText(plaintext: string): { ciphertext: string; iv: string; tag: string } {
    const result = encrypt(Buffer.from(plaintext, 'utf-8'), this.key);
    const payload = {
      ciphertext: result.ciphertext.toString('base64'),
      iv: result.iv.toString('base64'),
      tag: result.tag.toString('base64'),
    };
    logInfo('Crypto', 'AES encryption successful', { payloadId: payload.iv.slice(0, 8) });
    return payload;
  }

  encryptBuffer(plaintext: Buffer): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
    const result = encrypt(plaintext, this.key);
    logInfo('Crypto', 'AES buffer encryption successful');
    return result;
  }

  decryptBuffer(ciphertext: Buffer, iv: Buffer, tag: Buffer): Buffer {
    const plain = decrypt(ciphertext, iv, tag, this.key);
    logInfo('Crypto', 'AES decryption successful');
    return plain;
  }

  decryptFromComponents(ciphertextB64: string, ivB64: string, tagB64: string): string {
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const plain = this.decryptBuffer(ciphertext, iv, tag);
    return plain.toString('utf-8');
  }
}
