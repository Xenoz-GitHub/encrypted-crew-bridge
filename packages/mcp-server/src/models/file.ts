export interface FileContent {
  filename: string;
  content: string;
  decryptedAt: string;
}

export interface WriteFileRequest {
  project: string;
  filePath: string;
  content: string;
}

export interface ReadFileResponse {
  filename: string;
  content: string;
  decryptedAt: string;
}

export interface DeleteFileResponse {
  filename: string;
  deleted: boolean;
  deletedAt: string;
}
