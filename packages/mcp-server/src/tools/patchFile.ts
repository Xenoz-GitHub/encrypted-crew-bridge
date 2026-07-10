export const patchFileTool = {
  name: 'patch_file',
  description: 'Apply search/replace patches to a file. Fast for surgical edits — avoids sending the whole file.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      filePath: { type: 'string', description: 'File path within the project' },
      patches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Exact text to find' },
            replace: { type: 'string', description: 'Text to replace with' },
          },
          required: ['search', 'replace'],
        },
        description: 'Array of search/replace operations (applied in order)',
      },
    },
    required: ['project', 'filePath', 'patches'],
  },
};
