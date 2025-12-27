import { Readable } from 'stream';

export interface FileItem {
  name: string;
  path: string; // Absolute path for local, URL/Path for remote
  isDir: boolean;
  size?: number;
  mtime?: Date;
}

export interface IMediaSource {
  id: string; // Unique identifier for this source instance
  name: string; // User-friendly name
  type: 'local' | 'ftp' | 'webdav' | 'openlist';
  
  connect(config: Record<string, any>): Promise<boolean>;
  disconnect(): Promise<void>;
  
  listDir(path: string): Promise<FileItem[]>;
  getFileStream(path: string): Promise<Readable>;
  rename(oldPath: string, newPath: string): Promise<boolean>;
  batchRename(srcDir: string, renameObjects: Array<{ src_name: string, new_name: string }>): Promise<boolean>;
  writeFile(path: string, content: Buffer | string): Promise<boolean>;
}
