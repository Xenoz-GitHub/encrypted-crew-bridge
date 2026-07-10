export const deleteFileTool = {
  name: 'delete_file',
  description: 'Delete an encrypted file from a project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      filePath: { type: 'string', description: 'Relative path to the file within the project' },
    },
    required: ['project', 'filePath'],
  },
};
