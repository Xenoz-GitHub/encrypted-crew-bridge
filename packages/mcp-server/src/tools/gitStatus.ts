export const gitStatusTool = {
  name: 'git_status',
  description: 'Show git working tree status (modified, staged, untracked files)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Optional: restrict to a project' },
    },
    required: [] as string[],
  },
};
