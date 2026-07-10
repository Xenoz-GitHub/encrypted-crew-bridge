import { Router, type Request, type Response } from 'express';
import { McpController } from '../controllers/mcpController.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { env } from '../config/env.js';
import { getRecentLogs } from '../utils/logger.js';

export function createRouter(controller: McpController): Router {
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

  return router;
}
