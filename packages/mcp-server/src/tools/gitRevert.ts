export const gitRevertTool = {
  name: 'git_revert',
  description: 'Revert a file to its last committed state (git checkout --)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name' },
      filePath: { type: 'string', description: 'File path to revert' },
    },
    required: ['project', 'filePath'],
  },
};
