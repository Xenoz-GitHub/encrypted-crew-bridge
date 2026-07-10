export const renameFileTool = {
  name: 'rename_file',
  description: 'Rename or move a file within a project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      oldPath: { type: 'string', description: 'Current file path' },
      newPath: { type: 'string', description: 'New file path' },
    },
    required: ['project', 'oldPath', 'newPath'],
  },
};
