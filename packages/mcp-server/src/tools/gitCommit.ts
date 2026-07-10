export const gitCommitTool = {
  name: 'git_commit',
  description: 'Stage all changes and commit with a message',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name' },
      message: { type: 'string', description: 'Commit message' },
    },
    required: ['project', 'message'],
  },
};
