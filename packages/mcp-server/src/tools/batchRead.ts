export const batchReadTool = {
  name: 'batch_read',
  description: 'Read multiple files at once from a project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      filePaths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to read' },
    },
    required: ['project', 'filePaths'],
  },
};
