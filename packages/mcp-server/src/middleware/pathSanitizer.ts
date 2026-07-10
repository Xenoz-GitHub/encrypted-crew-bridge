import path from 'node:path';

export class PathTraversalError extends Error {
  constructor(userPath: string) {
    super(`Path traversal detected: ${userPath}`);
    this.name = 'PathTraversalError';
  }
}

export function sanitizePath(userPath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, userPath);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new PathTraversalError(userPath);
  }
  return resolved;
}
