export const projectSummaryTool = {
  name: 'project_summary',
  description: 'Get a high-level structural summary of a project (total files, dirs, size, key config files, detected type)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
    },
    required: ['project'],
  },
};
