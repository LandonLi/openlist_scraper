import { Readable } from 'stream';
import type { FileItem } from '../../shared/types';

export type { FileItem };

export interface BatchRenameItem {
  src_name: string;
  new_name: string;
}

export interface LocalSourceConnectConfig {
  path: string;
}

export interface OpenListSourceConnectConfig {
  url: string;
  token?: string;
  proxyUrl?: string;
}

export type SourceConnectConfig = LocalSourceConnectConfig | OpenListSourceConnectConfig;

export interface IMediaSource {
  id: string; // Unique identifier for this source instance
  name: string; // User-friendly name
  type: 'local' | 'ftp' | 'webdav' | 'openlist';

  connect(config: SourceConnectConfig): Promise<boolean>;
  disconnect(): Promise<void>;

  listDir(path: string): Promise<FileItem[]>;
  getFileStream(path: string): Promise<Readable>;
  rename(oldPath: string, newPath: string): Promise<boolean>;
  batchRename(
    srcDir: string,
    renameObjects: BatchRenameItem[],
    batchSize?: number,
    onProgress?: (current: number, total: number) => void,
  ): Promise<boolean>;
  writeFile(path: string, content: Buffer | string): Promise<boolean>;
}
