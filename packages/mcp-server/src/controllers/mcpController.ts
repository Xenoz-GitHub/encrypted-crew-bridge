import { FileService } from '../services/fileService.js';
import { EncryptionService } from '../services/encryptionService.js';
import {
  ListProjectsSchema,
  ReadFileSchema,
  WriteFileSchema,
  DeleteFileSchema,
  EncryptTextSchema,
  ExportFileSchema,
  SearchFilesSchema,
  ReadDirSchema,
  RenameFileSchema,
  BatchReadSchema,
  WriteFileRawSchema,
  ProjectSummarySchema,
  ReadFileRangeSchema,
  PatchFileSchema,
  GitStatusSchema,
  GitDiffSchema,
  GitCommitSchema,
  GitRevertSchema,
  RunTerminalSchema,
  UndoSchema,
  FormatFileSchema,
} from '../models/tool.js';
import { logInfo, logError } from '../utils/logger.js';

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class McpController {
  constructor(
    private readonly fileService: FileService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
    logInfo('MCP', `Tool call: ${name}`, args);
    try {
      switch (name) {
        case 'list_projects':
          return this.listProjects();
        case 'read_file':
          return this.readFile(args);
        case 'write_file':
          return this.writeFile(args);
        case 'delete_file':
          return this.deleteFile(args);
        case 'encrypt_text':
          return this.encryptText(args);
        case 'export_file':
          return this.exportFile(args);
        case 'search_files':
          return this.searchFiles(args);
        case 'read_dir':
          return this.readDir(args);
        case 'rename_file':
          return this.renameFile(args);
        case 'batch_read':
          return this.batchRead(args);
        case 'write_file_raw':
          return this.writeFileRaw(args);
        case 'project_summary':
          return this.projectSummary(args);
        case 'read_file_range':
          return this.readFileRange(args);
        case 'patch_file':
          return this.patchFile(args);
        case 'git_status':
          return this.gitStatus(args);
        case 'git_diff':
          return this.gitDiff(args);
        case 'git_commit':
          return this.gitCommit(args);
        case 'git_revert':
          return this.gitRevert(args);
        case 'run_terminal':
          return this.runTerminal(args);
        case 'undo':
          return this.undo(args);
        case 'format_file':
          return this.formatFile(args);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError('MCP', `Tool ${name} failed`, { error: msg });
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }

  private async listProjects(): Promise<ToolResponse> {
    const projects = await this.fileService.listProjects();
    return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
  }

  private async readFile(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath } = ReadFileSchema.parse(args);
    const content = await this.fileService.readFile(project, filePath);
    return { content: [{ type: 'text', text: content }] };
  }

  private async writeFile(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath, content, raw } = WriteFileSchema.parse(args);
    if (raw) {
      await this.fileService.writeFileRaw(project, filePath, content);
    } else {
      await this.fileService.writeFile(project, filePath, content);
    }
    return { content: [{ type: 'text', text: `File ${filePath} written successfully` }] };
  }

  private async deleteFile(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath } = DeleteFileSchema.parse(args);
    await this.fileService.deleteFile(project, filePath);
    return { content: [{ type: 'text', text: `File ${filePath} deleted successfully` }] };
  }

  private encryptText(args: Record<string, unknown>): ToolResponse {
    const { text } = EncryptTextSchema.parse(args);
    const result = this.encryptionService.encryptText(text);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async exportFile(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath, destination } = ExportFileSchema.parse(args);
    await this.fileService.exportFile(project, filePath, destination);
    return { content: [{ type: 'text', text: `File exported to ${destination}` }] };
  }

  private async searchFiles(args: Record<string, unknown>): Promise<ToolResponse> {
    const { query, project, includeExt, excludeDir } = SearchFilesSchema.parse(args);
    const results = await this.fileService.searchFiles(query, project, includeExt, excludeDir);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }

  private async readDir(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, subDir, depth } = ReadDirSchema.parse(args);
    const tree = await this.fileService.readDir(project, subDir, depth);
    return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
  }

  private async renameFile(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, oldPath, newPath } = RenameFileSchema.parse(args);
    await this.fileService.renameFile(project, oldPath, newPath);
    return { content: [{ type: 'text', text: `Renamed ${oldPath} to ${newPath}` }] };
  }

  private async batchRead(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePaths } = BatchReadSchema.parse(args);
    const results = await this.fileService.batchRead(project, filePaths);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }

  private async writeFileRaw(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath, content } = WriteFileRawSchema.parse(args);
    await this.fileService.writeFileRaw(project, filePath, content);
    return { content: [{ type: 'text', text: `Raw file ${filePath} written` }] };
  }

  private async projectSummary(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project } = ProjectSummarySchema.parse(args);
    const summary = await this.fileService.projectSummary(project);
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  }

  private async readFileRange(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath, startLine, endLine } = ReadFileRangeSchema.parse(args);
    const result = await this.fileService.readFileRange(project, filePath, startLine, endLine);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async patchFile(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath, patches } = PatchFileSchema.parse(args);
    const result = await this.fileService.patchFile(project, filePath, patches);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async gitStatus(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project } = GitStatusSchema.parse(args);
    const result = await this.fileService.gitStatus(project);
    return { content: [{ type: 'text', text: result }] };
  }

  private async gitDiff(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath } = GitDiffSchema.parse(args);
    const result = await this.fileService.gitDiff(project, filePath);
    return { content: [{ type: 'text', text: result }] };
  }

  private async gitCommit(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, message } = GitCommitSchema.parse(args);
    const result = await this.fileService.gitCommit(project, message);
    return { content: [{ type: 'text', text: result }] };
  }

  private async gitRevert(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath } = GitRevertSchema.parse(args);
    const result = await this.fileService.gitRevert(project, filePath);
    return { content: [{ type: 'text', text: result }] };
  }

  private async runTerminal(args: Record<string, unknown>): Promise<ToolResponse> {
    const { command, project } = RunTerminalSchema.parse(args);
    const result = await this.fileService.runTerminal(command, project);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async undo(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath } = UndoSchema.parse(args);
    let result;
    if (filePath && project) {
      const count = await this.fileService.undoFile(project, filePath);
      result = { restored: count, message: count > 0 ? `Restored ${count} version(s) of ${filePath}` : 'No undo history for ' + filePath };
    } else {
      const entry = await this.fileService.undoLast();
      result = entry ? { restored: 1, message: `Undid last write to ${entry.filePath} (${entry.lines} lines)` } : { restored: 0, message: 'Nothing to undo' };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private async formatFile(args: Record<string, unknown>): Promise<ToolResponse> {
    const { project, filePath } = FormatFileSchema.parse(args);
    const result = await this.fileService.formatFile(project, filePath);
    return { content: [{ type: 'text', text: result }] };
  }
}
