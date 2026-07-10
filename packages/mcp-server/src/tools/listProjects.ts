export const listProjectsTool = {
  name: 'list_projects',
  description: 'List all project directories in the workspace',
  inputSchema: {
    type: 'object' as const,
    properties: {} as Record<string, never>,
    required: [] as string[],
  },
};
