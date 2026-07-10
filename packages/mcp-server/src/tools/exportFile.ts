export const exportFileTool = {
  name: 'export_file',
  description: 'Decrypt a file from a project and export it to a destination path',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Name of the project directory' },
      filePath: { type: 'string', description: 'Relative path to the encrypted file within the project' },
      destination: { type: 'string', description: 'Absolute path to write the decrypted file' },
    },
    required: ['project', 'filePath', 'destination'],
  },
};
