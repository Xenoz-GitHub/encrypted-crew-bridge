import fs from 'node:fs/promises';
import fsRaw from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { sanitizePath, PathTraversalError } from '../middleware/pathSanitizer.js';
import { EncryptionService } from './encryptionService.js';
import { logInfo, logWarn, logError } from '../utils/logger.js';
import type { ProjectEntry, ProjectSummary, DirSummary, TreeNode } from '../models/project.js';

const ENC_SUFFIX = '.enc';
const DEFAULT_EXTS = ['.js','.ts','.jsx','.tsx','.json','.html','.css','.md','.py','.txt','.yml','.yaml','.toml','.env','.bat','.ps1','.mjs','.cjs'];
const DEFAULT_SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', '__pycache__', '.gitkeep', '.svn']);

interface EncFile {
  iv: string;
  tag: string;
  ciphertext: string;
}

export class FileService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly encryptionService: EncryptionService,
  ) {}

  // ── Gitignore support ──────────────────────────────────────────
  private gitignoreCache = new Map<string, string[]>();

  private async getGitignorePatterns(projectPath: string): Promise<string[]> {
    if (this.gitignoreCache.has(projectPath)) return this.gitignoreCache.get(projectPath)!;
    const patterns: string[] = [];
    try {
      const content = await fs.readFile(path.join(projectPath, '.gitignore'), 'utf-8');
      for (const line of content.split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#')) patterns.push(t);
      }
    } catch { /* no .gitignore */ }
    this.gitignoreCache.set(projectPath, patterns);
    return patterns;
  }

  private isIgnored(relativePath: string, patterns: string[]): boolean {
    const norm = relativePath.replace(/\\/g, '/');
    for (const p of patterns) {
      if (!p || p.startsWith('#')) continue;
      let pattern = p.trim();
      const dirOnly = pattern.endsWith('/');
      if (dirOnly) pattern = pattern.slice(0, -1);

      // Convert simple glob to regex
      let regexStr = pattern
        .replace(/\\/g, '/')
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '___DS___')
        .replace(/\*/g, '[^/]*')
        .replace(/___DS___/g, '.*')
        .replace(/\?/g, '.');

      const anchored = pattern.startsWith('/');
      if (anchored) regexStr = '^' + regexStr.slice(1);
      else regexStr = '(^|/)' + regexStr;

      const re = new RegExp(regexStr + '$');
      if (re.test(norm)) return true;

      // Dir pattern: also match children
      if (dirOnly && (norm === pattern || norm.startsWith(pattern + '/'))) return true;
    }
    return false;
  }

  private async ignorePatternsFor(projectDir: string): Promise<string[]> {
    const gitignore = await this.getGitignorePatterns(projectDir);
    // Merge built-in skips as gitignore-style patterns
    return [...DEFAULT_SKIP_DIRS].map(d => d + '/').concat(gitignore);
  }

  // ── List projects ──────────────────────────────────────────────
  async listProjects(): Promise<ProjectEntry[]> {
    await this.ensureWorkspace();
    const entries = await fs.readdir(this.workspaceRoot, { withFileTypes: true });
    const projects: ProjectEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || DEFAULT_SKIP_DIRS.has(entry.name)) continue;
      const dirPath = path.join(this.workspaceRoot, entry.name);
      const ig = await this.ignorePatternsFor(dirPath);
      const allFiles: string[] = [];
      await this.collectFiles(dirPath, '', ig, allFiles);
      projects.push({ name: entry.name, path: dirPath, fileCount: allFiles.length, files: allFiles });
    }
    logInfo('Filesystem', 'Listed projects', { count: projects.length });
    return projects;
  }

  private async collectFiles(root: string, prefix: string, ig: string[], result: string[]): Promise<void> {
    let dirEntries: fsRaw.Dirent[];
    try {
      dirEntries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
    } catch { return; }
    for (const de of dirEntries) {
      const rel = prefix ? prefix + '/' + de.name : de.name;
      if (de.isDirectory()) {
        if (!DEFAULT_SKIP_DIRS.has(de.name) && !this.isIgnored(rel + '/', ig)) {
          await this.collectFiles(root, rel, ig, result);
        }
      } else if (de.isFile()) {
        if (!this.isIgnored(rel, ig) && (DEFAULT_EXTS.some(e => de.name.endsWith(e)) || de.name.endsWith(ENC_SUFFIX))) {
          result.push(rel);
        }
      }
    }
  }

  async readFile(project: string, filePath: string): Promise<string> {
    const safeEnc = this.resolveProjectPath(project, filePath + ENC_SUFFIX);
    const safe = this.resolveProjectPath(project, filePath);
    // Prefer encrypted (saved via bridge), fallback to raw file
    try {
      const rawEnc = await fs.readFile(safeEnc, 'utf-8');
      const enc: EncFile = JSON.parse(rawEnc);
      const content = this.encryptionService.decryptFromComponents(enc.ciphertext, enc.iv, enc.tag);
      logInfo('Filesystem', 'Read and decrypted file', { project, filePath });
      return content;
    } catch {
      try {
        const raw = await fs.readFile(safe, 'utf-8');
        logInfo('Filesystem', 'Read raw file', { project, filePath });
        return raw;
      } catch {
        // Fallback: try all projects
        const entries = await fs.readdir(this.workspaceRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git' || entry.name === project) continue;
          try {
            const altEnc = this.resolveProjectPath(entry.name, filePath + ENC_SUFFIX);
            const rawAltEnc = await fs.readFile(altEnc, 'utf-8');
            const encAlt: EncFile = JSON.parse(rawAltEnc);
            const content = this.encryptionService.decryptFromComponents(encAlt.ciphertext, encAlt.iv, encAlt.tag);
            logInfo('Filesystem', 'Read decrypted from fallback project', { project: entry.name, filePath });
            return content;
          } catch { try {
            const altRaw = this.resolveProjectPath(entry.name, filePath);
            const content = await fs.readFile(altRaw, 'utf-8');
            logInfo('Filesystem', 'Read raw from fallback project', { project: entry.name, filePath });
            return content;
          } catch { continue; } }
        }
        throw new Error(`File not found: ${project}/${filePath}`);
      }
    }
  }

  async writeFile(project: string, filePath: string, content: string): Promise<void> {
    const safe = this.resolveProjectPath(project, filePath + ENC_SUFFIX);
    const encrypted = this.encryptionService.encryptText(content);
    const enc: EncFile = { ciphertext: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag };
    await fs.mkdir(path.dirname(safe), { recursive: true });
    await fs.writeFile(safe, JSON.stringify(enc, null, 2), 'utf-8');
    logInfo('Filesystem', 'Encrypted and wrote file', { project, filePath });
  }

  async deleteFile(project: string, filePath: string): Promise<void> {
    const safe = this.resolveProjectPath(project, filePath + ENC_SUFFIX);
    const safeRaw = this.resolveProjectPath(project, filePath);
    let deleted = false;
    try { await fs.unlink(safe); deleted = true; } catch { /* no encrypted file */ }
    try { await fs.unlink(safeRaw); deleted = true; } catch { /* no raw file */ }
    if (!deleted) throw new Error(`File not found: ${project}/${filePath}`);
    logInfo('Filesystem', 'Deleted file', { project, filePath });
  }

  async exportFile(project: string, filePath: string, destination: string): Promise<void> {
    const encPath = this.resolveProjectPath(project, filePath + ENC_SUFFIX);
    const raw = await fs.readFile(encPath, 'utf-8');
    const enc = JSON.parse(raw);
    const content = this.encryptionService.decryptFromComponents(enc.ciphertext, enc.iv, enc.tag);
    const destResolved = path.resolve(destination);
    await fs.mkdir(path.dirname(destResolved), { recursive: true });
    await fs.writeFile(destResolved, content, 'utf-8');
    logInfo('Filesystem', 'Exported decrypted file', { project, filePath, destination: destResolved });
  }

  // ── Search files ──────────────────────────────────────────────
  async searchFiles(query: string, project?: string, includeExt?: string[], excludeDir?: string[]): Promise<Array<{ file: string; line: number; content: string }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const exts = includeExt && includeExt.length > 0 ? includeExt : DEFAULT_EXTS;
    const skipDirs = new Set([...DEFAULT_SKIP_DIRS, ...(excludeDir || [])]);
    await this.ensureWorkspace();
    if (project) {
      const dirPath = path.join(this.workspaceRoot, project);
      try { await fs.access(dirPath); } catch { throw new Error(`Project not found: ${project}`); }
      const ig = await this.ignorePatternsFor(dirPath);
      await this.searchDir(query, dirPath, results, exts, skipDirs, ig, 5);
    } else {
      const entries = await fs.readdir(this.workspaceRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || skipDirs.has(entry.name)) continue;
        const dirPath = path.join(this.workspaceRoot, entry.name);
        const ig = await this.ignorePatternsFor(dirPath);
        await this.searchDir(query, dirPath, results, exts, skipDirs, ig, 5);
      }
    }
    logInfo('Filesystem', 'Searched files', { query, count: results.length });
    return results;
  }

  private async searchDir(
    query: string, dirPath: string,
    results: Array<{ file: string; line: number; content: string }>,
    exts: string[], skipDirs: Set<string>, ignorePatterns: string[], depth: number,
  ): Promise<void> {
    if (depth <= 0) return;
    let entries: fsRaw.Dirent[];
    try { entries = await fs.readdir(dirPath, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const rel = path.relative(dirPath, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name) && !this.isIgnored(rel + '/', ignorePatterns)) {
          await this.searchDir(query, fullPath, results, exts, skipDirs, ignorePatterns, depth - 1);
        }
      } else if (!this.isIgnored(rel, ignorePatterns) && (exts.some(e => entry.name.endsWith(e)) || entry.name.endsWith(ENC_SUFFIX))) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query.toLowerCase())) {
              results.push({ file: fullPath, line: i + 1, content: lines[i].trim() });
            }
          }
        } catch { /* skip unreadable */ }
      }
    }
  }

  // ── Directory tree (with file sizes) ───────────────────────────
  async readDir(project: string, subDir?: string, depth = 2): Promise<TreeNode> {
    const basePath = subDir
      ? this.resolveProjectPath(project, subDir)
      : this.resolveProjectPath(project, '.');
    const stat = await fs.stat(basePath);
    if (!stat.isDirectory()) throw new Error(`Not a directory: ${project}/${subDir || ''}`);
    const projectDir = this.resolveProjectPath(project, '.');
    const ig = await this.ignorePatternsFor(projectDir);
    return this.buildTree(basePath, depth, ig);
  }

  private async buildTree(dirPath: string, depth: number, ignorePatterns: string[]): Promise<TreeNode> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dirPath, entry.name);
      const rel = entry.name;
      if (entry.isDirectory()) {
        if (this.isIgnored(rel + '/', ignorePatterns)) continue;
        const sub = depth > 1 ? await this.buildTree(full, depth - 1, ignorePatterns) : null;
        children.push(sub || { path: full, type: 'dir', children: [] });
      } else if (!this.isIgnored(rel, ignorePatterns) && (DEFAULT_EXTS.some(e => entry.name.endsWith(e)) || entry.name.endsWith(ENC_SUFFIX))) {
        let size = 0;
        try { size = (await fs.stat(full)).size; } catch {}
        children.push({ path: full, type: 'file', size });
      }
    }
    return { path: dirPath, type: 'dir', children };
  }

  // ── Project summary ────────────────────────────────────────────
  async projectSummary(project: string): Promise<ProjectSummary> {
    const dirPath = path.join(this.workspaceRoot, project);
    await fs.access(dirPath);
    const ig = await this.ignorePatternsFor(dirPath);
    const dirs: DirSummary[] = [];
    let totalFiles = 0, totalSize = 0, totalDirs = 0;
    const keyFiles: string[] = [];

    await this.summarizeDir(dirPath, dirPath, ig, dirs, 4, (relPath: string) => { keyFiles.push(relPath); });

    for (const d of dirs) { totalFiles += d.fileCount; totalSize += d.sizeBytes; totalDirs++; }

    let detectedType = 'unknown';
    const hasFile = (name: string) => fsRaw.existsSync(path.join(dirPath, name));
    if (hasFile('package.json')) detectedType = 'node';
    else if (hasFile('requirements.txt') || hasFile('setup.py') || hasFile('pyproject.toml')) detectedType = 'python';
    else if (hasFile('Cargo.toml')) detectedType = 'rust';
    else if (hasFile('go.mod')) detectedType = 'go';
    else if (hasFile('pom.xml') || hasFile('build.gradle')) detectedType = 'java';

    return {
      name: project, totalFiles, totalSizeBytes: totalSize, totalDirs,
      dirs, keyFiles, detectedType,
    };
  }

  private async summarizeDir(
    root: string, dirPath: string, ig: string[],
    dirs: DirSummary[], depth: number, onKeyFile: (rel: string) => void,
  ): Promise<void> {
    let entries: fsRaw.Dirent[];
    try { entries = await fs.readdir(dirPath, { withFileTypes: true }); } catch { return; }
    let fileCount = 0, sizeBytes = 0;

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dirPath, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (DEFAULT_SKIP_DIRS.has(entry.name) || this.isIgnored(rel + '/', ig)) continue;
        if (depth > 1) {
          await this.summarizeDir(root, full, ig, dirs, depth - 1, onKeyFile);
        }
      } else {
        if (this.isIgnored(rel, ig)) continue;
        if (!DEFAULT_EXTS.some(e => entry.name.endsWith(e)) && !entry.name.endsWith(ENC_SUFFIX)) continue;
        let size = 0;
        try { size = (await fs.stat(full)).size; } catch {}
        fileCount++;
        sizeBytes += size;

        const lower = entry.name.toLowerCase();
        if (['package.json', 'tsconfig.json', 'readme.md', 'dockerfile', '.env.example', 'vite.config.ts', 'webpack.config.js', 'eslintrc', 'prettierrc', 'cargo.toml', 'go.mod', 'pom.xml', 'requirements.txt', 'makefile', 'justfile', 'compose.yaml', 'compose.yml'].some(k => lower === k || lower.endsWith(k))) {
          onKeyFile(rel);
        }
      }
    }

    const relDir = path.relative(root, dirPath).replace(/\\/g, '/') || '.';
    dirs.push({ path: relDir, fileCount, sizeBytes });
  }

  // ── Read file range (large file support) ──────────────────────
  async readFileRange(project: string, filePath: string, startLine?: number, endLine?: number): Promise<{ content: string; totalLines: number; totalBytes: number }> {
    const full = await this.readFile(project, filePath);
    const totalBytes = Buffer.byteLength(full, 'utf-8');
    const lines = full.split('\n');
    const totalLines = lines.length;
    if (startLine == null && endLine == null) {
      return { content: full, totalLines, totalBytes };
    }
    const s = Math.max(1, startLine || 1) - 1;
    const e = Math.min(totalLines, endLine || totalLines);
    const selected = lines.slice(s, e).join('\n');
    return { content: selected, totalLines, totalBytes };
  }

  async renameFile(project: string, oldPath: string, newPath: string): Promise<void> {
    const src = this.resolveProjectPath(project, oldPath + ENC_SUFFIX);
    const dst = this.resolveProjectPath(project, newPath + ENC_SUFFIX);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    logInfo('Filesystem', 'Renamed file', { project, oldPath, newPath });
  }

  async batchRead(project: string, filePaths: string[]): Promise<Array<{ path: string; content: string; error?: string }>> {
    const results: Array<{ path: string; content: string; error?: string }> = [];
    for (const fp of filePaths) {
      try {
        const content = await this.readFile(project, fp);
        results.push({ path: fp, content });
      } catch (err) {
        results.push({ path: fp, content: '', error: err instanceof Error ? err.message : String(err) });
      }
    }
    logInfo('Filesystem', 'Batch read', { project, count: filePaths.length });
    return results;
  }

  // ── Patch file (search/replace, surgical edits) ──────────────
  async patchFile(project: string, filePath: string, patches: Array<{ search: string; replace: string }>): Promise<{ applied: number; failed: number; errors: string[]; diff: string }> {
    await this.snapshot(project, filePath);
    const full = this.resolveProjectPath(project, filePath);
    let content: string;
    try {
      content = await fs.readFile(full, 'utf-8');
    } catch {
      throw new Error(`File not found: ${project}/${filePath}`);
    }

    let applied = 0, failed = 0;
    const errors: string[] = [];

    for (const patch of patches) {
      if (!patch.search) { failed++; errors.push('Empty search block'); continue; }
      const idx = content.indexOf(patch.search);
      if (idx === -1) {
        failed++;
        const preview = patch.search.length > 60 ? patch.search.slice(0, 60) + '...' : patch.search;
        errors.push(`Search text not found: "${preview}"`);
        continue;
      }
      content = content.slice(0, idx) + patch.replace + content.slice(idx + patch.search.length);
      applied++;
    }

    if (applied > 0) {
      await fs.writeFile(full, content, 'utf-8');
      logInfo('Filesystem', 'Patched file', { project, filePath, applied, failed });
      // Auto-format silently
      try { await this.formatFile(project, filePath); } catch {}
    }
    // Build diff summary
    const oldLines = this.undoBuffer.length > 0 ? this.undoBuffer[this.undoBuffer.length - 1].content.split('\n').length : 0;
    const newLines = content.split('\n').length;
    const diff = '+' + (newLines - oldLines > 0 ? newLines - oldLines : 0) + ' / -' + (oldLines - newLines > 0 ? oldLines - newLines : 0) + ' lines';
    return { applied, failed, errors, diff };
  }

  // ── Undo buffer ────────────────────────────────────────────────
  private undoBuffer: Array<{ project: string; filePath: string; content: string; timestamp: number }> = [];
  private async snapshot(project: string, filePath: string): Promise<void> {
    try {
      const full = this.resolveProjectPath(project, filePath);
      const content = await fs.readFile(full, 'utf-8');
      this.undoBuffer.push({ project, filePath, content, timestamp: Date.now() });
      if (this.undoBuffer.length > 20) this.undoBuffer.shift();
    } catch { /* file doesn't exist yet, nothing to snapshot */ }
  }

  async undoLast(): Promise<{ project: string; filePath: string; lines: number } | null> {
    const entry = this.undoBuffer.pop();
    if (!entry) return null;
    const full = this.resolveProjectPath(entry.project, entry.filePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, entry.content, 'utf-8');
    const lines = entry.content.split('\n').length;
    logInfo('Filesystem', 'Undo restored', { project: entry.project, filePath: entry.filePath, lines });
    return { project: entry.project, filePath: entry.filePath, lines };
  }

  async undoFile(project: string, filePath: string): Promise<number> {
    let restored = 0;
    for (let i = this.undoBuffer.length - 1; i >= 0; i--) {
      const e = this.undoBuffer[i];
      if (e.project === project && e.filePath === filePath) {
        this.undoBuffer.splice(i, 1);
        const full = this.resolveProjectPath(e.project, e.filePath);
        await fs.writeFile(full, e.content, 'utf-8');
        restored++;
      }
    }
    return restored;
  }

  // ── Git integration ────────────────────────────────────────────
  private async git(args: string[], project?: string): Promise<string> {
    const cwd = project ? this.resolveProjectPath(project, '.') : this.workspaceRoot;
    return new Promise((resolve, reject) => {
      exec(`git ${args.join(' ')}`, { cwd, timeout: 15000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve(stdout.trim());
      });
    });
  }

  async gitStatus(project?: string): Promise<string> {
    try {
      const status = await this.git(['status', '--short', '--branch'], project);
      return status || 'clean working tree';
    } catch (e) { return 'Error: ' + (e instanceof Error ? e.message : String(e)); }
  }

  async gitDiff(project?: string, filePath?: string): Promise<string> {
    try {
      const args = ['diff', '--no-color'];
      if (filePath) args.push('--', filePath);
      return await this.git(args, project) || '(no diff)';
    } catch (e) { return 'Error: ' + (e instanceof Error ? e.message : String(e)); }
  }

  async gitCommit(project: string, message: string): Promise<string> {
    try {
      await this.git(['add', '-A'], project);
      const result = await this.git(['commit', '-m', message], project);
      return result || 'committed';
    } catch (e) { return 'Error: ' + (e instanceof Error ? e.message : String(e)); }
  }

  async gitRevert(project: string, filePath: string): Promise<string> {
    try {
      const result = await this.git(['checkout', '--', filePath], project);
      return 'Reverted ' + filePath;
    } catch (e) { return 'Error: ' + (e instanceof Error ? e.message : String(e)); }
  }

  // ── Terminal execution ─────────────────────────────────────────
  private DANGEROUS_CMDS = ['rm -rf', 'rmdir /s', 'del /f', 'format ', 'shutdown', 'reboot', ':(){ :|:& };:'];

  async runTerminal(command: string, project?: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const lower = command.toLowerCase();
    for (const d of this.DANGEROUS_CMDS) { if (lower.includes(d)) return { stdout: '', stderr: 'Command blocked: destructive operation not allowed', code: 1 }; }
    const cwd = project ? this.resolveProjectPath(project, '.') : this.workspaceRoot;
    return new Promise((resolve) => {
      exec(command, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        resolve({ stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 2000), code: err ? (err as any).code || 1 : 0 });
      });
    });
  }

  // ── Format file ────────────────────────────────────────────────
  async formatFile(project: string, filePath: string): Promise<string> {
    const full = this.resolveProjectPath(project, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const formatters: Record<string, string> = {
      '.js': 'prettier --write', '.ts': 'prettier --write', '.jsx': 'prettier --write', '.tsx': 'prettier --write',
      '.json': 'prettier --write', '.css': 'prettier --write', '.html': 'prettier --write', '.md': 'prettier --write',
      '.yml': 'prettier --write', '.yaml': 'prettier --write',
    };
    const cmd = formatters[ext];
    if (!cmd) return 'No formatter available for ' + ext;
    try {
      await new Promise<void>((resolve, reject) => {
        exec(`npx ${cmd} "${full}"`, { cwd: path.dirname(full), timeout: 10000 }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      return 'Formatted ' + filePath;
    } catch (e) {
      // Fallback: basic formatting
      try {
        let content = await fs.readFile(full, 'utf-8');
        if (ext === '.json') { content = JSON.stringify(JSON.parse(content), null, 2); await fs.writeFile(full, content, 'utf-8'); return 'Formatted ' + filePath; }
      } catch {}
      return 'Format skipped: ' + ((e as Error).message || 'unknown');
    }
  }

  // Override writeFileRaw and patchFile to snapshot
  async writeFileRaw(project: string, filePath: string, content: string): Promise<void> {
    await this.snapshot(project, filePath);
    const safe = this.resolveProjectPath(project, filePath);
    await fs.mkdir(path.dirname(safe), { recursive: true });
    await fs.writeFile(safe, content, 'utf-8');
    logInfo('Filesystem', 'Wrote raw file', { project, filePath });
    // Auto-format silently if possible
    try { await this.formatFile(project, filePath); } catch {}
  }

  private resolveProjectPath(project: string, filePath: string): string {
    const projectDir = sanitizePath(project, this.workspaceRoot);
    if (!projectDir.startsWith(this.workspaceRoot)) {
      throw new PathTraversalError(project);
    }
    const full = sanitizePath(filePath, projectDir);
    if (!full.startsWith(projectDir)) {
      throw new PathTraversalError(filePath);
    }
    return full;
  }

  private async ensureWorkspace(): Promise<void> {
    try {
      await fs.mkdir(this.workspaceRoot, { recursive: true });
    } catch {
      // directory already exists
    }
  }
}
