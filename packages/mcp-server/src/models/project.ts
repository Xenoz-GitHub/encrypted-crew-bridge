export interface ProjectEntry {
  name: string;
  path: string;
  fileCount: number;
  files: string[];
}

export interface ProjectSummary {
  name: string;
  totalFiles: number;
  totalDirs: number;
  totalSizeBytes: number;
  dirs: DirSummary[];
  keyFiles: string[];
  detectedType: string;
}

export interface DirSummary {
  path: string;
  fileCount: number;
  sizeBytes: number;
}

export interface TreeNode {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  children?: TreeNode[];
}
