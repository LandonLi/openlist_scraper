import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { HttpsProxyAgent } from 'https-proxy-agent';
import ElectronStore from 'electron-store';

export class UpdateService {
    private store: ElectronStore;
    private mainWindow: BrowserWindow | null = null;
    private tempPath: string;

    constructor(store: ElectronStore) {
        this.store = store;
        this.tempPath = path.join(app.getPath('temp'), 'OpenListScraper-Update');
    }

    setMainWindow(win: BrowserWindow) {
        this.mainWindow = win;
    }

    async checkUpdate(): Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion: string; releaseNote?: string; assetUrl?: string; error?: string }> {
        try {
            const currentVersion = app.getVersion();
            const proxyUrl = this.store.get('proxy_url') as string;

            const options: any = {
                headers: { 'User-Agent': 'OpenListScraper' }
            };

            if (proxyUrl) {
                options.agent = new HttpsProxyAgent(proxyUrl);
            }

            // Latest release API
            const response = await fetch('https://api.github.com/repos/LandonLi/openlist_scraper/releases/latest', options);

            if (!response.ok) {
                throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
            }

            const data: any = await response.json();
            const tagName = data.tag_name;
            const cleanTag = tagName.replace(/^v/, '');

            // Simple semver compare
            if (this.compareVersions(cleanTag, currentVersion) > 0) {
                // Find exe asset
                const asset = data.assets.find((a: any) => a.name.endsWith('.exe'));
                return {
                    hasUpdate: true,
                    currentVersion,
                    latestVersion: cleanTag,
                    releaseNote: data.body,
                    assetUrl: asset ? asset.browser_download_url : undefined
                };
            }

            return { hasUpdate: false, currentVersion, latestVersion: currentVersion };

        } catch (e: any) {
            console.error('Check update failed:', e);
            return { hasUpdate: false, currentVersion: app.getVersion(), latestVersion: '', error: e.message };
        }
    }

    async downloadUpdate(url: string): Promise<boolean> {
        try {
            await fs.ensureDir(this.tempPath);
            const filePath = path.join(this.tempPath, 'setup.exe');

            // Clean up previous
            if (await fs.pathExists(filePath)) {
                await fs.remove(filePath);
            }

            const proxyUrl = this.store.get('proxy_url') as string;
            const options: any = {
                headers: { 'User-Agent': 'OpenListScraper' }
            };

            if (proxyUrl) {
                options.agent = new HttpsProxyAgent(proxyUrl);
            }

            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

            const totalSize = Number(response.headers.get('content-length') || 0);
            const fileStream = fs.createWriteStream(filePath);
            let downloaded = 0;

            return new Promise<boolean>((resolve, reject) => {
                response.body!.pipe(fileStream);

                response.body!.on('data', (chunk: Buffer) => {
                    downloaded += chunk.length;
                    if (this.mainWindow && totalSize > 0) {
                        const percent = (downloaded / totalSize) * 100;
                        this.mainWindow.webContents.send('update:download-progress', { percent: percent.toFixed(1) });
                    }
                });

                fileStream.on('finish', () => {
                    resolve(true);
                });

                fileStream.on('error', (err) => {
                    reject(err);
                });
            });

        } catch (e) {
            console.error('Download update failed', e);
            return false;
        }
    }

    installUpdate() {
        const filePath = path.join(this.tempPath, 'setup.exe');
        if (fs.existsSync(filePath)) {
            // Spawn detached process
            spawn(filePath, ['/silent'], {
                detached: true,
                stdio: 'ignore'
            }).unref();

            app.quit();
        }
    }

    // Helper: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
    private compareVersions(v1: string, v2: string): number {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }
}
