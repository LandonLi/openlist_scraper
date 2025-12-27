import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import { IMediaSource, FileItem } from '../interfaces/IMediaSource';

export class LocalSource implements IMediaSource {
  id: string;
  name: string;
  type: 'local' = 'local';
  private rootPath: string = '';

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  async connect(config: { path: string }): Promise<boolean> {
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
    
    // Ensure we don't escape rootPath
    const fullPath = path.resolve(this.rootPath, dirPath.replace(/^\/+/g, ''));
    if (!fullPath.startsWith(path.resolve(this.rootPath))) {
      throw new Error('Access denied: Path outside root');
    }

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
    return fs.createReadStream(path);
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    try {
        await fs.rename(oldPath, newPath);
        return true;
    } catch (e) {
        return false;
    }
  }

  async batchRename(srcDir: string, renameObjects: Array<{ src_name: string, new_name: string }>): Promise<boolean> {
    try {
        for (const obj of renameObjects) {
            await fs.rename(
                path.join(srcDir, obj.src_name),
                path.join(srcDir, obj.new_name)
            );
        }
        return true;
    } catch (e) {
        return false;
    }
  }

  async writeFile(path: string, content: Buffer | string): Promise<boolean> {
    try {
        await fs.outputFile(path, content);
        return true;
    } catch (e) {
        return false;
    }
  }
}
