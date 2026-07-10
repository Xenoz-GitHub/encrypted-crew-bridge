export const formatFileTool = {
  name: 'format_file',
  description: 'Format a file with Prettier (supports JS, TS, JSX, TSX, JSON, CSS, HTML, MD, YAML)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name' },
      filePath: { type: 'string', description: 'File path to format' },
    },
    required: ['project', 'filePath'],
  },
};
