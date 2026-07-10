export const writeFileTool = {
  name: 'write_file',
  description: 'Encrypt and write a file to a project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      filePath: { type: 'string', description: 'Relative path to the file within the project' },
      content: { type: 'string', description: 'Plaintext content to encrypt and write' },
    },
    required: ['project', 'filePath', 'content'],
  },
};
