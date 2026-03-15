import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

type ReleaseNoteEntry = {
  note: string | null;
  version: string;
};

export interface CheckUpdateResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNote?: string;
  error?: string;
}

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private readonly htmlEntityMap: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: '\'',
    nbsp: ' ',
  };

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = log;

    autoUpdater.on('download-progress', (progress) => {
      this.mainWindow?.webContents.send('update:download-progress', this.serializeProgress(progress));
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.mainWindow?.webContents.send('update:downloaded', {
        version: info.version,
        releaseNote: this.normalizeReleaseNotes(info.releaseNotes),
      });
    });

    autoUpdater.on('error', (error) => {
      this.mainWindow?.webContents.send('update:error', {
        message: error?.message || 'Unknown auto-update error',
      });
    });
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  async checkUpdate(): Promise<CheckUpdateResult> {
    const currentVersion = app.getVersion();

    if (!app.isPackaged) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        error: '自动更新仅在打包后的安装版本中可用。',
      };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;

      if (info && this.compareVersions(info.version, currentVersion) > 0) {
        return this.buildAvailableResult(currentVersion, info);
      }

      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
      };
    } catch (error: any) {
      log.error('Check update failed', error);
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        error: error?.message || '检查更新失败',
      };
    }
  }

  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!app.isPackaged) {
      return {
        success: false,
        error: '自动更新仅在打包后的安装版本中可用。',
      };
    }

    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error: any) {
      log.error('Download update failed', error);
      return {
        success: false,
        error: error?.message || '下载更新失败',
      };
    }
  }

  installUpdate() {
    if (!app.isPackaged) {
      return false;
    }

    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  private buildAvailableResult(currentVersion: string, info: UpdateInfo): CheckUpdateResult {
    return {
      hasUpdate: true,
      currentVersion,
      latestVersion: info.version,
      releaseNote: this.normalizeReleaseNotes(info.releaseNotes),
    };
  }

  private serializeProgress(progress: ProgressInfo) {
    return {
      bytesPerSecond: progress.bytesPerSecond,
      delta: progress.delta,
      percent: Number(progress.percent.toFixed(1)),
      total: progress.total,
      transferred: progress.transferred,
    };
  }

  private normalizeReleaseNotes(
    releaseNotes?: string | Array<ReleaseNoteEntry> | null,
  ): string {
    if (!releaseNotes) {
      return '暂无发布说明';
    }

    if (typeof releaseNotes === 'string') {
      return this.formatReleaseNoteText(releaseNotes);
    }

    const notes = releaseNotes
      .map((item) => {
        const header = item.version ? `v${item.version}` : '新版本';
        return `${header}\n${this.formatReleaseNoteText(item.note)}`.trim();
      })
      .filter(Boolean);

    return notes.join('\n\n').trim() || '暂无发布说明';
  }

  private formatReleaseNoteText(rawText?: string | null): string {
    if (!rawText) {
      return '暂无发布说明';
    }

    const text = this.decodeHtmlEntities(
      rawText
        .replace(/\r\n/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|section|article|header|footer|h[1-6]|blockquote|pre|table|tr)\b[^>]*>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '\n- ')
        .replace(/<\/li>/gi, '')
        .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    )
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter((line, index, lines) => line || lines[index - 1])
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text || '暂无发布说明';
  }

  private decodeHtmlEntities(input: string): string {
    return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }

      if (entity.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }

      return this.htmlEntityMap[entity.toLowerCase()] ?? `&${entity};`;
    });
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i += 1) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }
}
