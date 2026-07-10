export const searchFilesTool = {
  name: 'search_files',
  description: 'Search file contents across projects for a query string',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Text to search for' },
      project: { type: 'string', description: 'Optional: restrict search to one project' },
      includeExt: { type: 'array', items: { type: 'string' }, description: 'Only search files with these extensions (e.g. [".js", ".ts"])' },
      excludeDir: { type: 'array', items: { type: 'string' }, description: 'Skip these directory names during search' },
    },
    required: ['query'],
  },
};
