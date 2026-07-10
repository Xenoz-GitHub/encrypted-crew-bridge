import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpController } from '../controllers/mcpController.js';
import { LicenseService } from '../services/licenseService.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { env } from '../config/env.js';
import { getRecentLogs } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function adminAuth(req: Request, res: Response, next: () => void): void {
  const auth = req.headers.authorization;
  if (auth === `Bearer ${env.ADMIN_PASSWORD}` || req.query.admin === env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function createRouter(controller: McpController, licenseService: LicenseService): Router {
  const router = Router();
  const rateLimiter = createRateLimiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX);

  router.use((req: Request, res: Response, next) => {
    const clientId = req.ip || 'unknown';
    if (!rateLimiter(clientId)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  });

  // ── Public ──────────────────────────────────────────────────────
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  router.get('/logs', (_req: Request, res: Response) => {
    const count = parseInt(_req.query.count as string, 10) || 50;
    res.json(getRecentLogs(count));
  });

  router.post('/tools/:name', async (req: Request, res: Response) => {
    const { name } = req.params;
    const result = await controller.handleToolCall(name, req.body);
    res.json(result);
  });

  router.post('/auth/validate', async (req: Request, res: Response) => {
    const { key, deviceId, email } = req.body;
    if (!key) { res.status(400).json({ valid: false, reason: 'Key is required' }); return; }
    const result = await licenseService.validateKey(key, req.ip || 'unknown', deviceId, email);
    res.json(result);
  });

  // ── Admin: Key management ───────────────────────────────────────
  router.post('/admin/keys/generate', adminAuth, async (req: Request, res: Response) => {
    const type = req.body.type;
    const validTypes = ['lifetime', 'onetime', 'trial'];
    const normalizedType = validTypes.includes(type) ? type : 'lifetime';
    const customKey = req.body.customKey?.trim();
    const hours = req.body.hours ? parseInt(req.body.hours, 10) : undefined;
    const entry = licenseService.generateKey(normalizedType, customKey || undefined, hours ? { hours } : undefined);
    res.json(entry);
  });

  router.get('/admin/keys', adminAuth, async (_req: Request, res: Response) => {
    const keys = await licenseService.listKeys();
    res.json(keys);
  });

  router.get('/admin/keys/search', adminAuth, async (req: Request, res: Response) => {
    const query = req.query.q as string;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const filters: { status?: string; type?: string } = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    const results = await licenseService.searchKeys(query, Object.keys(filters).length > 0 ? filters : undefined);
    res.json(results);
  });

  router.get('/admin/keys/:id', adminAuth, async (req: Request, res: Response) => {
    const entry = await licenseService.getKey(req.params.id);
    if (!entry) { res.status(404).json({ error: 'Key not found' }); return; }
    res.json(entry);
  });

  router.get('/admin/keys/:id/events', adminAuth, async (req: Request, res: Response) => {
    const events = await licenseService.getEvents(req.params.id);
    res.json(events);
  });

  router.put('/admin/keys/:id/notes', adminAuth, async (req: Request, res: Response) => {
    const ok = await licenseService.updateNotes(req.params.id, req.body.notes || '');
    res.json({ success: ok });
  });

  router.put('/admin/keys/:id/restrictions', adminAuth, async (req: Request, res: Response) => {
    const whitelist: string[] = req.body.whitelist || [];
    const blacklist: string[] = req.body.blacklist || [];
    const ok = await licenseService.updateRestrictions(req.params.id, whitelist, blacklist);
    res.json({ success: ok });
  });

  router.delete('/admin/keys/:id', adminAuth, async (req: Request, res: Response) => {
    const reason = (req.query.reason as string) || '';
    const ok = await licenseService.revokeKey(req.params.id, reason);
    res.json({ success: ok });
  });

  // ── Admin: Stats & Export ───────────────────────────────────────
  router.get('/admin/stats', adminAuth, async (_req: Request, res: Response) => {
    const stats = await licenseService.getStats();
    res.json(stats);
  });

  router.get('/admin/export/csv', adminAuth, async (_req: Request, res: Response) => {
    const csv = licenseService.exportCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="license-keys.csv"');
    res.send(csv);
  });

  // ── Admin: Dashboard ────────────────────────────────────────────
  router.get('/admin', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../admin/admin.html'));
  });

  return router;
}
