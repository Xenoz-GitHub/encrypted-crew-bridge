export const encryptTextTool = {
  name: 'encrypt_text',
  description: 'Encrypt arbitrary text and return the ciphertext, iv, and tag',
  inputSchema: {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Plaintext to encrypt' },
    },
    required: ['text'],
  },
};
