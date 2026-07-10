import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { logInfo, logError } from './utils/logger.js';
import { toolDefinitions } from './tools/index.js';
import { McpController } from './controllers/mcpController.js';
import { FileService } from './services/fileService.js';
import { EncryptionService } from './services/encryptionService.js';
import { LicenseService } from './services/licenseService.js';
import { createRouter } from './api/routes.js';

const encryptionService = new EncryptionService();
const fileService = new FileService(env.WORKSPACE_ROOT, encryptionService);
const licenseService = new LicenseService(env.WORKSPACE_ROOT);
const controller = new McpController(fileService, encryptionService);

const mcpServer = new Server(
  { name: 'encrypted-crew-bridge', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return controller.handleToolCall(name, (args ?? {}) as Record<string, unknown>) as any;
});

async function start(): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', createRouter(controller, licenseService));
  app.get('/admin', (_req, res) => {
    res.redirect('/api/admin');
  });

  app.listen(env.PORT, () => {
    logInfo('MCP', 'Server started', { port: env.PORT, workspace: env.WORKSPACE_ROOT });
  });
}

start().catch((err) => {
  logError('MCP', 'Failed to start server', { error: String(err) });
  process.exit(1);
});
