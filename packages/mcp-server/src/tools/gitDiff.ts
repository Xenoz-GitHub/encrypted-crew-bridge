export const gitDiffTool = {
  name: 'git_diff',
  description: 'Show uncommitted diff for tracked files',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Optional: restrict to a project' },
      filePath: { type: 'string', description: 'Optional: restrict to a specific file' },
    },
    required: [] as string[],
  },
};
