import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { logInfo, logWarn, logError } from '../utils/logger.js';

interface ActivityEvent {
  type: 'validate' | 'revoke' | 'note' | 'restriction';
  timestamp: string;
  clientIp?: string;
  deviceId?: string;
  email?: string;
  detail?: string;
}

interface LicenseKey {
  id: string;
  key: string;
  type: 'lifetime' | 'onetime' | 'trial';
  status: 'active' | 'used' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt?: string;
  deviceId?: string;
  dsEmail?: string;
  usedBy?: string;
  usedAt?: string;
  notes?: string;
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  events?: ActivityEvent[];
  sessionCount?: number;
}

export class LicenseService {
  private keys: LicenseKey[] = [];
  private readonly filePath: string;
  private loaded = false;

  constructor(workspaceRoot: string) {
    this.filePath = path.join(workspaceRoot, '.license-keys.json');
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.keys = JSON.parse(raw);
    } catch {
      this.keys = [];
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.keys, null, 2), 'utf-8');
  }

  private addEvent(entry: LicenseKey, event: Omit<ActivityEvent, 'timestamp'>): void {
    if (!entry.events) entry.events = [];
    entry.events.push({ ...event, timestamp: new Date().toISOString() });
    entry.sessionCount = (entry.sessionCount || 0) + 1;
  }

  private checkIPRestrictions(entry: LicenseKey, clientIp: string): string | null {
    if (entry.ipBlacklist && entry.ipBlacklist.length > 0) {
      if (entry.ipBlacklist.some((r) => clientIp.includes(r))) {
        return 'IP is blacklisted';
      }
    }
    if (entry.ipWhitelist && entry.ipWhitelist.length > 0) {
      if (!entry.ipWhitelist.some((r) => clientIp.includes(r))) {
        return 'IP not in whitelist';
      }
    }
    return null;
  }

  generateKey(type: 'lifetime' | 'onetime' | 'trial', customKey?: string, options?: { hours?: number }): LicenseKey {
    const formatted = customKey || (() => {
      const raw = crypto.randomBytes(8).toString('hex').toUpperCase();
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
    })();
    const expiresAt = type === 'trial'
      ? new Date(Date.now() + (options?.hours || 5) * 3600000).toISOString()
      : undefined;
    const entry: LicenseKey = {
      id: crypto.randomUUID(),
      key: formatted,
      type,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt,
      events: [],
      sessionCount: 0,
    };
    this.addEvent(entry, { type: 'validate', detail: 'Key generated' });
    this.keys.push(entry);
    this.save().catch((err) => logError('MCP', 'Failed to save license key', { error: err.message }));
    logInfo('MCP', 'License key generated', { type, key: formatted, expiresAt });
    return entry;
  }

  async addKey(key: string, type: 'lifetime' | 'onetime' | 'trial', options?: { hours?: number }): Promise<void> {
    await this.load();
    const expiresAt = type === 'trial'
      ? new Date(Date.now() + (options?.hours || 5) * 3600000).toISOString()
      : undefined;
    const entry: LicenseKey = {
      id: crypto.randomUUID(),
      key,
      type,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt,
      events: [],
      sessionCount: 0,
    };
    this.addEvent(entry, { type: 'validate', detail: 'Key added manually' });
    this.keys.push(entry);
    await this.save();
    logInfo('MCP', 'License key added', { type, key });
  }

  async validateKey(key: string, clientIp: string, deviceId?: string, email?: string): Promise<{ valid: boolean; reason?: string; expired?: boolean }> {
    await this.load();
    const entry = this.keys.find((k) => k.key === key);
    if (!entry) {
      logWarn('MCP', 'Invalid license key attempt', { clientIp });
      return { valid: false, reason: 'Invalid key' };
    }

    // Check IP restrictions
    const ipReason = this.checkIPRestrictions(entry, clientIp);
    if (ipReason) {
      this.addEvent(entry, { type: 'validate', clientIp, deviceId, email, detail: `Blocked: ${ipReason}` });
      await this.save();
      logWarn('MCP', 'IP restriction blocked', { key: entry.key, clientIp, reason: ipReason });
      return { valid: false, reason: ipReason };
    }

    if (entry.status === 'revoked') {
      this.addEvent(entry, { type: 'validate', clientIp, deviceId, email, detail: 'Attempted use of revoked key' });
      await this.save();
      logWarn('MCP', 'Revoked license key used', { key: entry.key, clientIp });
      return { valid: false, reason: 'Key has been revoked' };
    }

    if (entry.type === 'onetime' && entry.status === 'used') {
      logWarn('MCP', 'One-time key already used', { key: entry.key, clientIp });
      return { valid: false, reason: 'One-time key already used' };
    }

    // Check trial expiry
    if (entry.type === 'trial' && entry.expiresAt && Date.now() > new Date(entry.expiresAt).getTime()) {
      entry.status = 'expired';
      this.addEvent(entry, { type: 'validate', clientIp, deviceId, email, detail: 'Trial expired' });
      await this.save();
      logWarn('MCP', 'Trial key expired', { key: entry.key });
      return { valid: false, reason: 'Trial expired', expired: true };
    }

    // Device binding (anti-sharing)
    if (deviceId) {
      if (!entry.deviceId) {
        entry.deviceId = deviceId;
        entry.dsEmail = email || undefined;
        entry.usedBy = clientIp;
        entry.usedAt = new Date().toISOString();
      } else if (entry.deviceId !== deviceId) {
        this.addEvent(entry, { type: 'validate', clientIp, deviceId, email, detail: 'Device mismatch rejected' });
        await this.save();
        logWarn('MCP', 'Device mismatch for key', { key: entry.key, expected: entry.deviceId, got: deviceId });
        return { valid: false, reason: 'Key already in use on another device' };
      }
    }

    if (entry.type === 'onetime') {
      entry.status = 'used';
      entry.usedBy = clientIp;
      entry.usedAt = new Date().toISOString();
    }

    this.addEvent(entry, { type: 'validate', clientIp, deviceId, email, detail: 'Successful validation' });
    await this.save();
    logInfo('MCP', 'License key validated', { type: entry.type, clientIp, deviceId });
    return { valid: true, expired: false };
  }

  async listKeys(): Promise<LicenseKey[]> {
    await this.load();
    return [...this.keys];
  }

  async getKey(id: string): Promise<LicenseKey | undefined> {
    await this.load();
    return this.keys.find((k) => k.id === id);
  }

  async searchKeys(query?: string, filters?: { status?: string; type?: string }): Promise<LicenseKey[]> {
    await this.load();
    let result = [...this.keys];
    if (query) {
      const q = query.toLowerCase();
      result = result.filter((k) =>
        k.key.toLowerCase().includes(q) ||
        (k.dsEmail && k.dsEmail.toLowerCase().includes(q)) ||
        (k.deviceId && k.deviceId.toLowerCase().includes(q)) ||
        (k.notes && k.notes.toLowerCase().includes(q)) ||
        (k.usedBy && k.usedBy.toLowerCase().includes(q))
      );
    }
    if (filters?.status) {
      result = result.filter((k) => k.status === filters.status);
    }
    if (filters?.type) {
      result = result.filter((k) => k.type === filters.type);
    }
    return result;
  }

  async getEvents(keyId: string): Promise<ActivityEvent[]> {
    await this.load();
    const entry = this.keys.find((k) => k.id === keyId);
    return entry?.events || [];
  }

  async updateNotes(keyId: string, notes: string): Promise<boolean> {
    await this.load();
    const entry = this.keys.find((k) => k.id === keyId);
    if (!entry) return false;
    entry.notes = notes;
    this.addEvent(entry, { type: 'note', detail: notes ? 'Notes updated' : 'Notes cleared' });
    await this.save();
    return true;
  }

  async updateRestrictions(keyId: string, whitelist: string[], blacklist: string[]): Promise<boolean> {
    await this.load();
    const entry = this.keys.find((k) => k.id === keyId);
    if (!entry) return false;
    entry.ipWhitelist = whitelist.length > 0 ? whitelist : undefined;
    entry.ipBlacklist = blacklist.length > 0 ? blacklist : undefined;
    this.addEvent(entry, { type: 'restriction', detail: `Whitelist: ${whitelist.join(',') || 'none'} | Blacklist: ${blacklist.join(',') || 'none'}` });
    await this.save();
    return true;
  }

  async revokeKey(id: string, reason?: string): Promise<boolean> {
    await this.load();
    const entry = this.keys.find((k) => k.id === id);
    if (!entry) return false;
    entry.status = 'revoked';
    this.addEvent(entry, { type: 'revoke', detail: reason || 'No reason given' });
    await this.save();
    logInfo('MCP', 'License key revoked', { key: entry.key, reason: reason || 'none' });
    return true;
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    used: number;
    revoked: number;
    expired: number;
    totalSessions: number;
    topKeys: { key: string; sessions: number }[];
    recentActivity: { key: string; email?: string; event: string; timestamp: string }[];
  }> {
    await this.load();
    let active = 0, used = 0, revoked = 0, expired = 0, totalSessions = 0;
    const keySessions: { key: string; sessions: number }[] = [];
    const allEvents: { key: string; email?: string; event: string; timestamp: string }[] = [];

    for (const k of this.keys) {
      if (k.status === 'active') active++;
      else if (k.status === 'used') used++;
      else if (k.status === 'revoked') revoked++;
      else if (k.status === 'expired') expired++;
      totalSessions += k.sessionCount || 0;
      keySessions.push({ key: k.key, sessions: k.sessionCount || 0 });

      if (k.events) {
        for (const e of k.events.slice(-5)) {
          allEvents.push({ key: k.key, email: k.dsEmail, event: e.detail || e.type, timestamp: e.timestamp });
        }
      }
    }

    keySessions.sort((a, b) => b.sessions - a.sessions);
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      total: this.keys.length,
      active,
      used,
      revoked,
      expired,
      totalSessions,
      topKeys: keySessions.slice(0, 10),
      recentActivity: allEvents.slice(0, 50),
    };
  }

  exportCsv(): string {
    const header = 'Key,Type,Status,Created,Expires,Device,Email,Sessions,Notes\n';
    const rows = this.keys.map((k) =>
      [
        k.key,
        k.type,
        k.status,
        k.createdAt,
        k.expiresAt || '',
        k.deviceId || '',
        k.dsEmail || '',
        k.sessionCount || 0,
        (k.notes || '').replace(/,/g, ';'),
      ].join(',')
    );
    return header + rows.join('\n');
  }
}
