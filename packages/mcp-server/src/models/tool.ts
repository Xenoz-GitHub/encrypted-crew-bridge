import { z } from 'zod';

export const ListProjectsSchema = z.object({});

export const ReadFileSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePath: z.string().min(1, 'File path is required'),
});

export const WriteFileSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePath: z.string().min(1, 'File path is required'),
  content: z.string(),
  raw: z.boolean().optional().describe('If true, write unencrypted raw file'),
});

export const DeleteFileSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePath: z.string().min(1, 'File path is required'),
});

export const EncryptTextSchema = z.object({
  text: z.string(),
});

export const ExportFileSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePath: z.string().min(1, 'File path is required'),
  destination: z.string().min(1, 'Destination path is required'),
});

export const SearchFilesSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  project: z.string().optional().describe('If set, only search within this project'),
  includeExt: z.array(z.string()).optional().describe('Only search files with these extensions (e.g. [".js", ".ts"])'),
  excludeDir: z.array(z.string()).optional().describe('Skip these directory names during search'),
});

export const ReadDirSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  subDir: z.string().optional().describe('Subdirectory within the project'),
  depth: z.number().int().min(1).max(5).optional().default(2).describe('Recursion depth (1 = flat, 2 = one level, etc.)'),
});

export const RenameFileSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  oldPath: z.string().min(1, 'Current file path'),
  newPath: z.string().min(1, 'New file path'),
});

export const BatchReadSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePaths: z.array(z.string().min(1)).min(1, 'At least one path required'),
});

export const WriteFileRawSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePath: z.string().min(1, 'File path is required'),
  content: z.string(),
});

export type ListProjectsInput = z.infer<typeof ListProjectsSchema>;
export type ReadFileInput = z.infer<typeof ReadFileSchema>;
export type WriteFileInput = z.infer<typeof WriteFileSchema>;
export type DeleteFileInput = z.infer<typeof DeleteFileSchema>;
export type EncryptTextInput = z.infer<typeof EncryptTextSchema>;
export type ExportFileInput = z.infer<typeof ExportFileSchema>;
export type SearchFilesInput = z.infer<typeof SearchFilesSchema>;
export type ReadDirInput = z.infer<typeof ReadDirSchema>;
export type RenameFileInput = z.infer<typeof RenameFileSchema>;
export type BatchReadInput = z.infer<typeof BatchReadSchema>;
export type WriteFileRawInput = z.infer<typeof WriteFileRawSchema>;

export const ProjectSummarySchema = z.object({
  project: z.string().min(1, 'Project name is required'),
});

export const ReadFileRangeSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePath: z.string().min(1, 'File path is required'),
  startLine: z.number().int().positive().optional().describe('Start line (1-indexed)'),
  endLine: z.number().int().positive().optional().describe('End line (inclusive)'),
});

export type ProjectSummaryInput = z.infer<typeof ProjectSummarySchema>;
export type ReadFileRangeInput = z.infer<typeof ReadFileRangeSchema>;

export const PatchFileSchema = z.object({
  project: z.string().min(1, 'Project name is required'),
  filePath: z.string().min(1, 'File path is required'),
  patches: z.array(
    z.object({
      search: z.string(),
      replace: z.string(),
    })
  ).min(1, 'At least one patch is required'),
});

export type PatchFileInput = z.infer<typeof PatchFileSchema>;

export const GitStatusSchema = z.object({ project: z.string().optional() });
export const GitDiffSchema = z.object({ project: z.string().optional(), filePath: z.string().optional() });
export const GitCommitSchema = z.object({ project: z.string().min(1), message: z.string().min(1) });
export const GitRevertSchema = z.object({ project: z.string().min(1), filePath: z.string().min(1) });
export const RunTerminalSchema = z.object({ command: z.string().min(1), project: z.string().optional() });
export const UndoSchema = z.object({ project: z.string().optional(), filePath: z.string().optional() });
export const FormatFileSchema = z.object({ project: z.string().min(1), filePath: z.string().min(1) });
