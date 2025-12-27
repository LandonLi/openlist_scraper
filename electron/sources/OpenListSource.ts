import { Readable } from 'stream';
import { IMediaSource, FileItem } from '../interfaces/IMediaSource';
import axios from 'axios';
import path from 'path';

// Placeholder for OpenList (assuming HTTP based)
export class OpenListSource implements IMediaSource {
  id: string;
  name: string;
  type: 'openlist' = 'openlist';
  private baseUrl: string = '';
  private token: string = '';

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  async connect(config: { url: string, token?: string }): Promise<boolean> {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.token = config.token || '';
    
    try {
        const response = await axios.get(`${this.baseUrl}/api/me`, {
          headers: { 'Authorization': this.token },
          timeout: 5000
        });
        return response.status === 200 && response.data?.code === 200;
    } catch (e) {
        return false;
    }
  }

  async disconnect(): Promise<void> {
    this.baseUrl = '';
    this.token = '';
  }

  async listDir(dirPath: string): Promise<FileItem[]> {
    if (!this.baseUrl) throw new Error('Not connected');
    
    // OpenList uses absolute paths starting with /
    const reqPath = dirPath.startsWith('/') ? dirPath : '/' + dirPath;

    try {
      const response = await axios.post(`${this.baseUrl}/api/fs/list`, {
        path: reqPath,
        password: "", 
        page: 1,
        per_page: 0,
        refresh: true
      }, {
        headers: { 'Authorization': this.token }
      });

      if (response.data.code !== 200) {
        throw new Error(response.data.message || 'Failed to list directory');
      }

      return response.data.data.content.map((item: any) => ({
        name: item.name,
        path: path.posix.join(reqPath, item.name),
        isDir: item.is_dir,
        size: item.size
      }));
    } catch (error: any) {
      console.error('OpenList listDir error:', error);
      throw error;
    }
  }

  async getFileStream(_path: string): Promise<Readable> {
    throw new Error('Method not implemented.');
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
        const response = await axios.post(`${this.baseUrl}/api/fs/rename`, {
            path: oldPath,
            name: path.posix.basename(newPath)
        }, {
            headers: { 'Authorization': this.token }
        });
        return response.data.code === 200;
    } catch (e) {
        console.error('OpenList rename error:', e);
        return false;
    }
  }

  async batchRename(srcDir: string, renameObjects: Array<{ src_name: string, new_name: string }>): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
        const response = await axios.post(`${this.baseUrl}/api/fs/batch_rename`, {
            src_dir: srcDir,
            rename_objects: renameObjects
        }, {
            headers: { 'Authorization': this.token }
        });
        
        if (response.data.code !== 200) {
            console.error('OpenList batchRename failed:', response.data.message);
            return false;
        }
        return true;
    } catch (e: any) {
        console.error('OpenList batchRename error:', e.response?.data || e.message);
        return false;
    }
  }

  async writeFile(filePath: string, content: Buffer | string): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
        const data = typeof content === 'string' ? Buffer.from(content) : content;
        
        console.log(`[OpenList] Request: PUT ${this.baseUrl}/api/fs/put`);
        console.log(`[OpenList] Target Path: ${filePath}`);

        // AList /api/fs/put can accept path as a query parameter or a header.
        // Moving it to query parameters is the most robust way to handle Unicode/Chinese characters.
        const response = await axios.put(`${this.baseUrl}/api/fs/put`, data, {
            params: {
                path: filePath
            },
            headers: { 
                'Authorization': this.token,
                'Content-Type': 'application/octet-stream',
                // Keep the header as a fallback, but using the latin1 trick which some servers expect
                'File-Path': Buffer.from(filePath).toString('latin1')
            }
        });
        
        const success = response.data.code === 200;
        if (!success) {
            console.error('OpenList writeFile failed:', response.data.code, response.data.message);
        }
        return success;
    } catch (e: any) {
        const errorData = e.response?.data;
        console.error('OpenList writeFile error:', errorData || e.message);
        return false;
    }
  }
}
