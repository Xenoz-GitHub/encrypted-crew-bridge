import { listProjectsTool } from './listProjects.js';
import { readFileTool } from './readFile.js';
import { writeFileTool } from './writeFile.js';
import { deleteFileTool } from './deleteFile.js';
import { encryptTextTool } from './encryptText.js';
import { exportFileTool } from './exportFile.js';
import { searchFilesTool } from './searchFiles.js';
import { readDirTool } from './readDir.js';
import { renameFileTool } from './renameFile.js';
import { batchReadTool } from './batchRead.js';
import { projectSummaryTool } from './projectSummary.js';
import { readFileRangeTool } from './readFileRange.js';
import { patchFileTool } from './patchFile.js';
import { gitStatusTool } from './gitStatus.js';
import { gitDiffTool } from './gitDiff.js';
import { gitCommitTool } from './gitCommit.js';
import { gitRevertTool } from './gitRevert.js';
import { runTerminalTool } from './runTerminal.js';
import { undoTool } from './undo.js';
import { formatFileTool } from './formatFile.js';

export const toolDefinitions = [
  listProjectsTool,
  readFileTool,
  writeFileTool,
  deleteFileTool,
  encryptTextTool,
  exportFileTool,
  searchFilesTool,
  readDirTool,
  renameFileTool,
  batchReadTool,
  projectSummaryTool,
  readFileRangeTool,
  patchFileTool,
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitRevertTool,
  runTerminalTool,
  undoTool,
  formatFileTool,
];
