import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import { IMediaSource, FileItem, type BatchRenameItem, type LocalSourceConnectConfig } from '../interfaces/IMediaSource';

export class LocalSource implements IMediaSource {
  id: string;
  name: string;
  type = 'local' as const;
  private rootPath: string = '';

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  async connect(config: LocalSourceConnectConfig): Promise<boolean> {
    try {
      if (!await fs.pathExists(config.path)) {
        return false;
      }
      this.rootPath = config.path;
      return true;
    } catch (error) {
      console.error('LocalSource connect error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // No-op for local fs
    this.rootPath = '';
  }

  async listDir(dirPath: string): Promise<FileItem[]> {
    if (!this.rootPath) throw new Error('Source not connected');

    const fullPath = this.resolveWithinRoot(dirPath);

    const items = await fs.readdir(fullPath, { withFileTypes: true });

    return Promise.all(items.map(async (item) => {
      const itemPath = path.join(fullPath, item.name);
      const relativePath = path.relative(this.rootPath, itemPath);
      let size = 0;
      let mtime = new Date();

      if (item.isFile()) {
        const stats = await fs.stat(itemPath);
        size = stats.size;
        mtime = stats.mtime;
      }

      return {
        name: item.name,
        path: relativePath, // Return relative path from root
        isDir: item.isDirectory(),
        size,
        mtime
      };
    }));
  }

  async getFileStream(path: string): Promise<Readable> {
    return fs.createReadStream(this.resolveWithinRoot(path));
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    try {
      await fs.rename(this.resolveWithinRoot(oldPath), this.resolveWithinRoot(newPath));
      return true;
    } catch (e) {
      return false;
    }
  }

  async batchRename(
    srcDir: string,
    renameObjects: BatchRenameItem[],
    _batchSize?: number,
    onProgress?: (current: number, total: number) => void,
  ): Promise<boolean> {
    try {
      const resolvedDir = this.resolveWithinRoot(srcDir);
      let processed = 0;
      for (const obj of renameObjects) {
        await fs.rename(
          path.join(resolvedDir, obj.src_name),
          path.join(resolvedDir, obj.new_name)
        );
        processed++;
        onProgress?.(processed, renameObjects.length);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  async writeFile(path: string, content: Buffer | string): Promise<boolean> {
    try {
      await fs.outputFile(this.resolveWithinRoot(path), content);
      return true;
    } catch (e) {
      return false;
    }
  }

  private resolveWithinRoot(targetPath: string): string {
    if (!this.rootPath) throw new Error('Source not connected');

    const normalizedRoot = path.resolve(this.rootPath);
    const candidatePath = targetPath.replace(/^[/\\]+/g, '');
    const resolvedPath = path.resolve(normalizedRoot, candidatePath);
    const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;

    if (resolvedPath !== normalizedRoot && !resolvedPath.startsWith(rootWithSep)) {
      throw new Error('Access denied: Path outside root');
    }

    return resolvedPath;
  }
}
