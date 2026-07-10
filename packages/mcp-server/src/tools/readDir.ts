export const readDirTool = {
  name: 'read_dir',
  description: 'List directory contents (tree view) within a project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      subDir: { type: 'string', description: 'Optional: subdirectory path within the project' },
      depth: { type: 'number', description: 'Recursion depth (1-5, default 2)' },
    },
    required: ['project'],
  },
};
