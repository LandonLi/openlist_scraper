import { IMediaSource } from '../interfaces/IMediaSource';
import { RegexEngine } from '../matchers/RegexEngine';
import { LLMEngine } from '../matchers/LLMEngine';
import { IMetadataProvider } from '../interfaces/IMetadataProvider';
import { DatabaseService } from './DatabaseService';
import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

export class ScannerService {
  private regexEngine: RegexEngine;
  private llmEngine: LLMEngine;
  private metadataProvider: IMetadataProvider;
  private mainWindow: BrowserWindow | null = null;
  private _isScanning: boolean = false;

  private showMetadataCache: Map<string, { id: string, poster?: string }> = new Map();
  private logLevel: 'info' | 'warn' | 'error' | 'debug' = 'info';
  private proxyUrl: string = '';
  private openListBatchSize: number = 20;

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
      (this.metadataProvider as any).setDebugLogger((msg: string) => this.debug(`[Metadata] ${msg} `));
    }
  }

  setLogLevel(level: 'info' | 'warn' | 'error' | 'debug') {
    this.logLevel = level;
    // Update dependencies if they support logging injection
    if (this.logLevel === 'debug') {
      if (typeof (this.metadataProvider as any).setDebugLogger === 'function') {
        (this.metadataProvider as any).setDebugLogger((msg: string) => this.debug(`[Metadata] ${msg} `));
      }
      if (typeof (this.llmEngine as any).setDebugLogger === 'function') {
        (this.llmEngine as any).setDebugLogger((msg: string) => this.debug(`[LLM] ${msg} `));
      }
    } else {
      // Optional: Clear loggers if we want to stop receiving them, 
      // but simpler to just filter them out in this.debug()
    }
  }

  setProxy(proxyUrl: string) {
    this.proxyUrl = proxyUrl;
    // Also update metadata provider if it supports it
    if (this.metadataProvider && typeof (this.metadataProvider as any).setProxy === 'function') {
      (this.metadataProvider as any).setProxy(proxyUrl);
    }
  }

  setOpenListBatchSize(size: number) {
    this.openListBatchSize = size > 0 ? size : 20;
  }

  private log(message: string, type: 'info' | 'error' | 'success' | 'warn' | 'debug' = 'info') {
    // Level Priority: debug < info < warn/success < error
    const levels = { debug: 0, info: 1, success: 2, warn: 2, error: 3 };
    const currentLevelScore = levels[this.logLevel] ?? 1;
    const msgLevelScore = levels[type] ?? 1;

    if (msgLevelScore >= currentLevelScore) {
      console.log(`[Scanner][${type.toUpperCase()}] ${message} `);
      this.mainWindow?.webContents.send('scanner-log', { message, type });
    }
  }

  public debug(message: string, data?: any) {
    if (this.logLevel !== 'debug') return;
    const suffix = data ? `\nData: ${JSON.stringify(data, null, 2)} ` : '';
    this.log(`${message}${suffix} `, 'debug');
  }

  private async requestUserConfirmation(detectedName: string, results: any[]): Promise<{ id: string, poster?: string, newName?: string, confirmedName?: string } | null> {
    if (!this.mainWindow) return null;
    return new Promise((resolve) => {
      setTimeout(() => {
        this.mainWindow?.webContents.send('scanner-require-confirmation', { detectedName, results });
      }, 200);
      ipcMain.once('scanner-confirm-response', (_: any, response: { seriesId: string | null, newName?: string, seriesName?: string }) => {
        // If user provided a new name to search
        if (response.newName) {
          resolve({ id: '', newName: response.newName });
          return;
        }

        const selected = results.find(r => r.id === response.seriesId);
        resolve(selected ? {
          id: selected.id,
          poster: selected.poster,
          confirmedName: response.seriesName || selected.name // 使用前端传来的名称或从结果中获取
        } : null);
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
      const config: any = {};
      if (this.proxyUrl) {
        try {
          config.agent = new HttpsProxyAgent(this.proxyUrl);
        } catch (e) {
          // ignore invalid proxy
        }
      }
      const response = await fetch(url, config);
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
      return null;
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
    } catch (e: any) { this.log(`Error listing dir ${dirPath}: ${e.message} `, 'error'); }
    return results;
  }

  async identifySingleFile(source: IMediaSource, targetPath: string, videoExtensions: string) {
    if (this._isScanning) return;
    this._isScanning = true;
    this.log(`正在识别上下文: ${targetPath} `);

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
            episode: match?.episode ?? 1,
            originalEpisode: match?.episode ?? 1,  // 保存原始集数
            source: 'llm_context'
          }
        });
      }

      // Reuse the processing logic
      await this.processSeriesGroup(source, resolveResult.seriesName, items);

    } catch (e: any) {
      this.log(`识别失败: ${e.message} `, 'error');
    } finally {
      this._isScanning = false;
      this.mainWindow?.webContents.send('scanner-finished');
    }
  }

  private async processSeriesGroup(source: IMediaSource, seriesName: string, items: any[], skipMetadata: boolean = false) {
    let seriesInfo = this.showMetadataCache.get(seriesName);
    let currentSearchName = seriesName;
    let confirmedSeriesName = seriesName; // 保存用户确认的剧集名称

    // Loop until we have series info or user cancels
    while (!seriesInfo) {
      const results = await this.metadataProvider.searchTVShow(currentSearchName);
      // Always show confirmation for single file identification to be safe
      const confirmed = await this.requestUserConfirmation(currentSearchName, results);

      if (!confirmed) return; // Cancelled

      if (confirmed.newName) {
        // User requesting re-search
        currentSearchName = confirmed.newName;
        this.log(`用户请求手动修正剧名: ${currentSearchName}, 正在重新搜索...`, 'info');
        continue;
      }

      if (confirmed.id) {
        seriesInfo = { id: confirmed.id, poster: confirmed.poster };
        // 如果用户确认了剧集名称,使用确认的名称
        if (confirmed.confirmedName) {
          confirmedSeriesName = confirmed.confirmedName;
          this.log(`使用用户确认的剧集名称: ${confirmedSeriesName}`, 'debug');
        }
        // 使用确认的名称作为缓存键
        this.showMetadataCache.set(confirmedSeriesName, seriesInfo);
        // 如果确认的名称与原始名称不同,也缓存原始名称以避免重复搜索
        if (confirmedSeriesName !== seriesName) {
          this.showMetadataCache.set(seriesName, seriesInfo);
        }
      } else {
        return; // Should be covered by !confirmed check, but just safe guard
      }
    }

    const tmdbId = seriesInfo.id;

    let matchedItems;
    if (skipMetadata) {
      // 跳过元数据获取，但仍需获取季总集数用于文件名格式
      const seasonsInGroup = new Set<number>(items.map(i => i.match.season ?? 1));
      const seasonEpisodeCounts: Map<number, number> = new Map();

      for (const seasonNum of seasonsInGroup) {
        try {
          const episodes = await this.metadataProvider.getSeasonDetails(tmdbId, seasonNum);
          seasonEpisodeCounts.set(seasonNum, episodes.length);
        } catch (e) {
          console.error(`Failed to get season ${seasonNum} details:`, e);
        }
      }

      matchedItems = items.map(item => ({
        ...item,
        tmdbId,
        match: {
          ...item.match,
          totalEpisodes: seasonEpisodeCounts.get(item.match.season ?? 1) || 0
        },
        metadata: undefined
      }));
    } else {
      // 原有逻辑：获取元数据
      const seasonsInGroup = new Set<number>(items.map(i => i.match.season ?? 1));
      const seasonCache: Map<number, any[]> = new Map();
      const seasonEpisodeCounts: Map<number, number> = new Map();  // 保存每季的总集数

      for (const seasonNum of seasonsInGroup) {
        this.log(`正在获取第 ${seasonNum} 季的元数据...`);
        const episodes = await this.metadataProvider.getSeasonDetails(tmdbId, seasonNum);
        seasonCache.set(seasonNum, episodes);
        seasonEpisodeCounts.set(seasonNum, episodes.length);  // 记录总集数
      }

      matchedItems = [];
      for (const item of items) {
        const currentSeason = item.match.season ?? 1;
        const seasonData = seasonCache.get(currentSeason) || [];
        const totalEpisodes = seasonEpisodeCounts.get(currentSeason) || 0;  // 获取总集数
        let epData = seasonData.find(e => e.episodeNumber === item.match.episode);

        // Fuzzy Match if needed (though LLM context should have done it)
        if (!epData && seasonData.length > 0) {
          const bestEpisodeNumber = await this.llmEngine.matchEpisodeFromList(item.file.name, seasonData);
          if (bestEpisodeNumber !== null) {
            epData = seasonData.find(e => e.episodeNumber === bestEpisodeNumber);
            if (epData) item.match.episode = bestEpisodeNumber;
          }
        }
        matchedItems.push({
          ...item,
          metadata: epData,
          tmdbId,
          match: {
            ...item.match,
            totalEpisodes  // 添加总集数
          }
        });
      }
    }

    const { confirmed, options, selectedIndices, updatedMatches } = await this.requestEpisodesConfirmation(confirmedSeriesName, matchedItems);
    if (confirmed && selectedIndices.length > 0) {
      await this.executeBatch(source, confirmedSeriesName, updatedMatches || matchedItems, selectedIndices, options, seriesInfo);
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
          // 根据总集数动态决定集数位数
          const episodeDigits = Math.max(2, String(item.match.totalEpisodes || 0).length);
          console.log(`[重命名] S${item.match.season}E${item.match.episode} - totalEpisodes: ${item.match.totalEpisodes}, digits: ${episodeDigits}`);
          const newName = `${seriesName} - S${String(item.match.season).padStart(2, '0')}E${String(item.match.episode).padStart(episodeDigits, '0')} - ${item.metadata.title}${fileExt}`;
          if (item.file.name !== newName) renameObjects.push({ src_name: item.file.name, new_name: newName });
        }
      }
      if (renameObjects.length > 0) {
        const commonDir = path.posix.dirname(itemsToProcess[0].file.path);
        // 对 OpenList 源使用配置的批次大小，本地源传递一个大值（不分批）
        const batchSize = source.type === 'openlist' ? this.openListBatchSize : 999999;

        // 进度回调：根据实际重命名的文件数更新进度
        const onRenameProgress = (current: number, total: number) => {
          const subPercent = (current / total) * 100;
          this.mainWindow?.webContents.send('scanner-operation-progress', {
            percent: Math.round(subPercent / totalSteps),
            message: `正在重命名文件... (${current}/${total})`,
            finished: false
          });
        };

        const success = await source.batchRename(commonDir, renameObjects, batchSize, onRenameProgress);
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
        const nfoContent = `<? xml version = "1.0" encoding = "UTF-8" standalone = "yes" ?>
  <episodedetails>
  <title>${item.metadata.title} </title>
    < season > ${item.match.season} </season>
      < episode > ${item.match.episode} </episode>
        < plot > ${item.metadata.overview} </plot>
          < aired > ${item.metadata.airDate || ''} </aired>
            < runtime > ${item.metadata.runtime || ''} </runtime>
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

      await this.processFileList(source, fileItems, videoExtensions, true);

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

  private async processFileList(source: IMediaSource, allFiles: any[], videoExtensions: string, skipMetadata: boolean = false, skipLLM: boolean = true) {
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
          dirResults.push({
            file,
            match: {
              ...match,
              originalEpisode: match.episode  // 保存正则识别的原始集数
            }
          });
        } else {
          unmatchedFiles.push(file);
        }
      }

      // If many files are unmatched in this dir
      if (unmatchedFiles.length > 0) {
        if (skipLLM) {
          // 跳过 LLM，标记为未识别
          for (const unmatched of unmatchedFiles) {
            // 尝试从文件名中提取数字作为集数
            const nameWithoutExt = unmatched.name.replace(/\.[^.]+$/, '');
            const numbers = nameWithoutExt.match(/\d+/g);
            let episode = null;
            let originalEpisode = null;

            // 如果找到数字，使用最后一个作为集数（通常是集数）
            if (numbers && numbers.length > 0) {
              episode = parseInt(numbers[numbers.length - 1], 10);
              originalEpisode = episode;
            }

            dirResults.push({
              file: unmatched,
              match: {
                success: false,
                seriesName: null,
                season: null,
                episode,
                originalEpisode,
                source: 'unmatched'
              }
            });
          }
        } else {
          // 使用 LLM 识别
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
                  originalEpisode: fileMatch?.episode,  // 保存原始集数
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
      }

      // Add to global series groups
      for (const res of dirResults) {
        const match = res.match;
        if (match.success && match.seriesName) {
          const cleanName = match.seriesName.replace(/[-\s._]+$/, '').trim();
          if (!groups.has(cleanName)) groups.set(cleanName, []);
          groups.get(cleanName)?.push(res);
        } else if (match.source === 'unmatched') {
          // 未匹配文件也需要分组显示，使用目录名作为临时剧集名
          const dir = path.posix.dirname(res.file.path);
          const dirName = path.posix.basename(dir) || 'Unknown';
          const groupKey = `[未识别] ${dirName}`;
          if (!groups.has(groupKey)) groups.set(groupKey, []);
          groups.get(groupKey)?.push(res);
        }
      }
    }

    for (const [seriesName, items] of groups.entries()) {
      // 检测并清理未识别文件的分组名
      let cleanSeriesName = seriesName;
      if (seriesName.startsWith('[未识别] ')) {
        cleanSeriesName = seriesName.replace('[未识别] ', '');
      }
      await this.processSeriesGroup(source, cleanSeriesName, items, skipMetadata);
    }
  }
}