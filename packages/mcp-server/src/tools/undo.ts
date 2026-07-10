export const undoTool = {
  name: 'undo',
  description: 'Undo the last write/patch operation (reverts file content)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Optional: restrict undo to a specific project' },
      filePath: { type: 'string', description: 'Optional: undo all changes to this specific file' },
    },
    required: [] as string[],
  },
};
