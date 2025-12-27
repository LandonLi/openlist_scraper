import { IMediaSource } from '../interfaces/IMediaSource';
import { RegexEngine } from '../matchers/RegexEngine';
import { LLMEngine } from '../matchers/LLMEngine';
import { IMetadataProvider } from '../interfaces/IMetadataProvider';
import { DatabaseService } from './DatabaseService';
import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import axios from 'axios';

export class ScannerService {
  private regexEngine: RegexEngine;
  private llmEngine: LLMEngine;
  private metadataProvider: IMetadataProvider;
  private mainWindow: BrowserWindow | null = null;
  private _isScanning: boolean = false;

  private showMetadataCache: Map<string, { id: string, poster?: string }> = new Map();
  private logLevel: 'info' | 'warn' | 'error' | 'debug' = 'info';

  constructor(
    regexEngine: RegexEngine,
    llmEngine: LLMEngine,
    metadataProvider: IMetadataProvider,
    _db: DatabaseService
  ) {
    this.regexEngine = regexEngine;
    this.llmEngine = llmEngine;
    this.metadataProvider = metadataProvider;
  }

  public get isScanning(): boolean {
    return this._isScanning;
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  setMetadataProvider(provider: IMetadataProvider) {
    this.metadataProvider = provider;
    if (this.logLevel === 'debug' && typeof (this.metadataProvider as any).setDebugLogger === 'function') {
      (this.metadataProvider as any).setDebugLogger((msg: string) => this.debug(`[Metadata] ${msg}`));
    }
  }

  setLogLevel(level: 'info' | 'warn' | 'error' | 'debug') {
    this.logLevel = level;
    // Update dependencies if they support logging injection
    if (this.logLevel === 'debug') {
      if (typeof (this.metadataProvider as any).setDebugLogger === 'function') {
        (this.metadataProvider as any).setDebugLogger((msg: string) => this.debug(`[Metadata] ${msg}`));
      }
      if (typeof (this.llmEngine as any).setDebugLogger === 'function') {
        (this.llmEngine as any).setDebugLogger((msg: string) => this.debug(`[LLM] ${msg}`));
      }
    } else {
      // Optional: Clear loggers if we want to stop receiving them, 
      // but simpler to just filter them out in this.debug()
    }
  }

  private log(message: string, type: 'info' | 'error' | 'success' | 'warn' | 'debug' = 'info') {
    // Level Priority: debug < info < warn/success < error
    const levels = { debug: 0, info: 1, success: 2, warn: 2, error: 3 };
    const currentLevelScore = levels[this.logLevel] ?? 1;
    const msgLevelScore = levels[type] ?? 1;

    if (msgLevelScore >= currentLevelScore) {
      console.log(`[Scanner] [${type.toUpperCase()}] ${message}`);
      this.mainWindow?.webContents.send('scanner-log', { message, type });
    }
  }

  public debug(message: string, data?: any) {
    if (this.logLevel !== 'debug') return;
    const suffix = data ? `\nData: ${JSON.stringify(data, null, 2)}` : '';
    this.log(`${message}${suffix}`, 'debug');
  }

  private async requestUserConfirmation(detectedName: string, results: any[]): Promise<{ id: string, poster?: string } | null> {
    if (!this.mainWindow) return null;
    return new Promise((resolve) => {
      setTimeout(() => {
        this.mainWindow?.webContents.send('scanner-require-confirmation', { detectedName, results });
      }, 200);
      ipcMain.once('scanner-confirm-response', (_: any, response: { seriesId: string | null }) => {
        const selected = results.find(r => r.id === response.seriesId);
        resolve(selected ? { id: selected.id, poster: selected.poster } : null);
      });
    });
  }

  private async requestEpisodesConfirmation(seriesName: string, matches: any[]): Promise<{ confirmed: boolean, options: any, selectedIndices: number[], updatedMatches?: any[] }> {
    if (!this.mainWindow) return { confirmed: false, options: {}, selectedIndices: [] };
    return new Promise((resolve) => {
      this.mainWindow?.webContents.send('scanner-require-episodes-confirmation', { seriesName, matches });
      ipcMain.once('scanner-episodes-confirm-response', (_: any, response: { confirmed: boolean, options: any, selectedIndices: number[], updatedMatches?: any[] }) => {
        resolve(response);
      });
    });
  }

  private async downloadImage(url: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (e) { return null; }
  }

  private async recursiveList(source: IMediaSource, dirPath: string): Promise<any[]> {
    let results: any[] = [];
    try {
      const items = await source.listDir(dirPath);
      for (const item of items) {
        results.push(item);
        if (item.isDir) {
          const subItems = await this.recursiveList(source, item.path);
          results = results.concat(subItems);
        }
      }
    } catch (e: any) { this.log(`Error listing dir ${dirPath}: ${e.message}`, 'error'); }
    return results;
  }

  async identifySingleFile(source: IMediaSource, targetPath: string, videoExtensions: string) {
    if (this._isScanning) return;
    this._isScanning = true;
    this.log(`正在识别上下文: ${targetPath}`);

    try {
      const dirPath = path.posix.dirname(targetPath);
      const allFiles = await source.listDir(dirPath);

      const extPattern = videoExtensions.split(',').map(e => e.trim()).filter(e => e).join('|');
      const videoRegex = new RegExp(`\.(${extPattern})$`, 'i');
      const videoFiles = allFiles.filter(f => !f.isDir && videoRegex.test(f.name));

      this.log(`上下文: 找到 ${videoFiles.length} 个同级视频文件。`);

      // Call LLM with directory context
      this.log('正在请求 LLM 根据目录上下文识别剧集信息...');
      const resolveResult = await this.llmEngine.resolveDirectory(dirPath, videoFiles.map(f => f.name));

      if (!resolveResult.seriesName) {
        this.log('LLM 无法识别该剧集。', 'error');
        return;
      }

      this.log(`LLM 识别成功: ${resolveResult.seriesName} (第 ${resolveResult.season} 季)`, 'success');

      // Construct items list similar to scanSource
      const items: any[] = [];
      for (const file of videoFiles) {
        // Only process the target file
        if (file.name !== path.basename(targetPath)) continue;

        const match = resolveResult.matches.find(m => m.filename === file.name);
        items.push({
          file,
          match: {
            success: true,
            seriesName: resolveResult.seriesName,
            season: resolveResult.season ?? 1,
            episode: match?.episode ?? 1, // Default to 1 if not matched, user can fix
            source: 'llm_context'
          }
        });
      }

      // Reuse the processing logic
      await this.processSeriesGroup(source, resolveResult.seriesName, items);

    } catch (e: any) {
      this.log(`识别失败: ${e.message}`, 'error');
    } finally {
      this._isScanning = false;
      this.mainWindow?.webContents.send('scanner-finished');
    }
  }

  private async processSeriesGroup(source: IMediaSource, seriesName: string, items: any[]) {
    let seriesInfo = this.showMetadataCache.get(seriesName);
    if (!seriesInfo) {
      const results = await this.metadataProvider.searchTVShow(seriesName);
      // Always show confirmation for single file identification to be safe
      const confirmed = await this.requestUserConfirmation(seriesName, results);
      if (confirmed) { seriesInfo = confirmed; this.showMetadataCache.set(seriesName, seriesInfo); }
      else { return; }
    }

    const tmdbId = seriesInfo.id;
    const seasonsInGroup = new Set<number>(items.map(i => i.match.season ?? 1));
    const seasonCache: Map<number, any[]> = new Map();

    for (const seasonNum of seasonsInGroup) {
      this.log(`正在获取第 ${seasonNum} 季的元数据...`);
      const episodes = await this.metadataProvider.getSeasonDetails(tmdbId, seasonNum);
      seasonCache.set(seasonNum, episodes);
    }

    const matchedItems = [];
    for (const item of items) {
      const currentSeason = item.match.season ?? 1;
      const seasonData = seasonCache.get(currentSeason) || [];
      let epData = seasonData.find(e => e.episodeNumber === item.match.episode);

      // Fuzzy Match if needed (though LLM context should have done it)
      if (!epData && seasonData.length > 0) {
        const bestEpisodeNumber = await this.llmEngine.matchEpisodeFromList(item.file.name, seasonData);
        if (bestEpisodeNumber !== null) {
          epData = seasonData.find(e => e.episodeNumber === bestEpisodeNumber);
          if (epData) item.match.episode = bestEpisodeNumber;
        }
      }
      matchedItems.push({ ...item, metadata: epData, tmdbId });
    }

    const { confirmed, options, selectedIndices, updatedMatches } = await this.requestEpisodesConfirmation(seriesName, matchedItems);
    if (confirmed && selectedIndices.length > 0) {
      await this.executeBatch(source, seriesName, updatedMatches || matchedItems, selectedIndices, options, seriesInfo);
    }
  }

  private async executeBatch(source: IMediaSource, seriesName: string, matchedItems: any[], selectedIndices: number[], options: any, seriesInfo: any) {
    const renameObjects: any[] = [];
    const itemsToProcess = selectedIndices.map(idx => matchedItems[idx]);
    const totalSteps = itemsToProcess.length * ((options.writeNfo ? 1 : 0) + (options.writeStill ? 1 : 0)) + (options.writePoster ? 1 : 0) + (options.rename ? 1 : 0);
    let currentStep = 0;
    const sendProgress = (msg: string) => {
      const percent = Math.round((currentStep / totalSteps) * 100);
      this.mainWindow?.webContents.send('scanner-operation-progress', { percent, message: msg, finished: false });
    };

    if (options.rename) {
      sendProgress('正在重命名文件...');
      for (const item of itemsToProcess) {
        if (item.metadata) {
          const fileExt = path.posix.extname(item.file.name);
          const newName = `${seriesName} - S${String(item.match.season).padStart(2, '0')}E${String(item.match.episode).padStart(2, '0')} - ${item.metadata.title}${fileExt}`;
          if (item.file.name !== newName) renameObjects.push({ src_name: item.file.name, new_name: newName });
        }
      }
      if (renameObjects.length > 0) {
        const commonDir = path.posix.dirname(itemsToProcess[0].file.path);
        const success = await source.batchRename(commonDir, renameObjects);
        if (success) {
          for (const item of itemsToProcess) {
            const renameInfo = renameObjects.find(r => r.src_name === item.file.name);
            if (renameInfo) { item.file.name = renameInfo.new_name; item.file.path = path.posix.join(commonDir, renameInfo.new_name); }
          }
        }
      }
      currentStep++;
    }

    const writtenPosters = new Set<string>();
    for (const item of itemsToProcess) {
      await new Promise(resolve => setTimeout(resolve, 50));
      const fileDir = path.posix.dirname(item.file.path);
      const fileExt = path.posix.extname(item.file.name);
      const finalBaseName = path.posix.basename(item.file.name, fileExt);

      if (options.writeNfo && item.metadata) {
        sendProgress(`写入 NFO: 第 ${item.match.episode} 集`);
        const nfoContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<episodedetails>
  <title>${item.metadata.title}</title>
  <season>${item.match.season}</season>
  <episode>${item.match.episode}</episode>
  <plot>${item.metadata.overview}</plot>
  <aired>${item.metadata.airDate || ''}</aired>
  <runtime>${item.metadata.runtime || ''}</runtime>
</episodedetails>`;
        await source.writeFile(path.posix.join(fileDir, `${finalBaseName}.nfo`), nfoContent);
        currentStep++;
      }
      if (options.writeStill && item.metadata?.stillPath) {
        sendProgress(`下载剧照: 第 ${item.match.episode} 集`);
        const imgBuffer = await this.downloadImage(item.metadata.stillPath);
        if (imgBuffer) await source.writeFile(path.posix.join(fileDir, `${finalBaseName}-thumb.jpg`), imgBuffer);
        currentStep++;
      }
      if (options.writePoster && seriesInfo.poster && !writtenPosters.has(fileDir)) {
        sendProgress(`下载海报`);
        const imgBuffer = await this.downloadImage(seriesInfo.poster);
        if (imgBuffer) { await source.writeFile(path.posix.join(fileDir, `poster.jpg`), imgBuffer); writtenPosters.add(fileDir); }
        currentStep++;
      }
    }
    this.mainWindow?.webContents.send('scanner-operation-progress', { percent: 100, message: '完成！', finished: true });
    this.log(`操作已完成: ${seriesName}`, 'success');
  }


  async scanSelectedFiles(source: IMediaSource, selectedPaths: string[], videoExtensions: string) {
    if (this._isScanning) return;
    this._isScanning = true;
    this.log(`开始扫描 ${selectedPaths.length} 个选定文件...`);

    try {
      const fileItems: any[] = [];
      const pathsByDir = new Map<string, Set<string>>();

      // Group by directory to minimize listDir calls
      for (const p of selectedPaths) {
        const dir = path.posix.dirname(p);
        if (!pathsByDir.has(dir)) pathsByDir.set(dir, new Set());
        pathsByDir.get(dir)?.add(path.posix.basename(p));
      }

      for (const [dir, files] of pathsByDir) {
        try {
          const dirItems = await source.listDir(dir);
          for (const item of dirItems) {
            if (files.has(item.name) && !item.isDir) {
              fileItems.push(item);
            }
          }
        } catch (e) {
          this.log(`无法访问目录 ${dir}`, 'warn');
        }
      }

      if (fileItems.length === 0) {
        this.log('选定的文件中没有有效的视频文件。', 'error');
        return;
      }

      await this.processFileList(source, fileItems, videoExtensions);

    } catch (e: any) {
      this.log(`扫描失败: ${e.message}`, 'error');
    } finally {
      this._isScanning = false;
      this.mainWindow?.webContents.send('scanner-finished');
    }
  }

  async scanSource(source: IMediaSource, startPath: string = '/', videoExtensions: string = 'mkv,mp4,avi,mov,iso,rmvb') {
    if (this._isScanning) {
      console.warn('[Scanner] Rejected scan: already running');
      return;
    }
    this._isScanning = true;
    this.log(`开始扫描源: ${source.name} 路径: ${startPath}`);

    try {
      this.log('正在遍历目录结构...');
      const allFiles = await this.recursiveList(source, startPath);
      await this.processFileList(source, allFiles, videoExtensions);
    } catch (error: any) { this.log(`扫描失败: ${error.message}`, 'error'); }
    finally { this._isScanning = false; this.log('扫描完成'); this.mainWindow?.webContents.send('scanner-finished'); }
  }

  private async processFileList(source: IMediaSource, allFiles: any[], videoExtensions: string) {
    const extPattern = videoExtensions.split(',').map(e => e.trim()).filter(e => e).join('|');
    const videoRegex = new RegExp(`\.(${extPattern})$`, 'i');
    const videoFiles = allFiles.filter(f => !f.isDir && videoRegex.test(f.name));
    this.log(`发现 ${videoFiles.length} 个视频文件。`);

    const groups: Map<string, any[]> = new Map();
    const dirGroups: Map<string, any[]> = new Map();

    // First pass: Group by directory
    for (const file of videoFiles) {
      const dir = path.posix.dirname(file.path);
      if (!dirGroups.has(dir)) dirGroups.set(dir, []);
      dirGroups.get(dir)?.push(file);
    }

    // Second pass: Process each directory group
    for (const [dir, filesInDir] of dirGroups.entries()) {
      const dirResults: Array<{ file: any, match: any }> = [];
      const unmatchedFiles: any[] = [];

      for (const file of filesInDir) {
        const match = await this.regexEngine.match(file.name);
        if (match.success) {
          dirResults.push({ file, match });
        } else {
          unmatchedFiles.push(file);
        }
      }

      // If many files are unmatched in this dir, try directory-level resolution
      if (unmatchedFiles.length > 0) {
        this.log(`正在尝试对目录 ${dir} (${unmatchedFiles.length} 个文件) 进行智能识别...`);
        const dirResolve = await this.llmEngine.resolveDirectory(dir, unmatchedFiles.map(f => f.name));

        if (dirResolve.seriesName) {
          for (const unmatched of unmatchedFiles) {
            const fileMatch = dirResolve.matches?.find(m => m.filename === unmatched.name);
            dirResults.push({
              file: unmatched,
              match: {
                success: true,
                seriesName: dirResolve.seriesName,
                season: dirResolve.season ?? 1,
                episode: fileMatch?.episode,
                source: 'llm_dir'
              }
            });
          }
        } else {
          // Fallback to individual LLM calls
          for (const unmatched of unmatchedFiles) {
            this.log(`正则匹配失败: ${unmatched.name}, 正在请求 LLM 识别...`);
            const match = await this.llmEngine.match(unmatched.name);
            dirResults.push({ file: unmatched, match });
          }
        }
      }

      // Add to global series groups
      for (const res of dirResults) {
        const match = res.match;
        if (match.success && match.seriesName) {
          const cleanName = match.seriesName.replace(/[-\s._]+$/, '').trim();
          if (!groups.has(cleanName)) groups.set(cleanName, []);
          groups.get(cleanName)?.push(res);
        }
      }
    }

    for (const [seriesName, items] of groups.entries()) {
      await this.processSeriesGroup(source, seriesName, items);
    }
  }
}