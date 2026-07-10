export const runTerminalTool = {
  name: 'run_terminal',
  description: 'Run a terminal command in the project root (30s timeout, destructive commands blocked)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'Command to execute' },
      project: { type: 'string', description: 'Optional: run in a specific project directory' },
    },
    required: ['command'],
  },
};
