export const readFileRangeTool = {
  name: 'read_file_range',
  description: 'Read a portion of a file by line range. Useful for large files.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      filePath: { type: 'string', description: 'File path within project' },
      startLine: { type: 'number', description: 'Start line (1-indexed, optional)' },
      endLine: { type: 'number', description: 'End line inclusive (optional)' },
    },
    required: ['project', 'filePath'],
  },
};
