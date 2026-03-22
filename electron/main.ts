import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import ElectronStore from 'electron-store';
import fs from 'fs-extra';
import type {
  ConfigKey,
  ConfigValueMap,
  ExplorerListRequest,
  FetchMetadataRequest,
  LlmTestRequest,
  OpenListTestRequest,
  ScanSelectedRequest,
  ScanSourceRequest,
  SmartIdentifyRequest,
} from '../shared/ipc';
import type {
  EpisodeMatchItem,
  LogLevel,
  OpenListListResponseData,
  OpenListResponse,
  RuleDefinition,
} from '../shared/types';
import { getNestedErrorMessage, toErrorResponse } from './utils/errors';

// Core Services
import { ScannerService } from './services/ScannerService';
import { DatabaseService, NativeDependencyError } from './services/DatabaseService';

// Core Logic
import { RegexEngine } from './matchers/RegexEngine';
import { LLMEngine } from './matchers/LLMEngine';
import { OpenAIClient } from './llm/OpenAIClient';
import { MetadataFactory } from './metadata/factory';
import { SourceFactory } from './sources/factory';
import { FetchClient } from './utils/FetchClient';
import type { IMetadataProvider } from './interfaces/IMetadataProvider';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. MUST set name before everything else to stabilize userData directory
app.setName('OpenListScraper');

process.env.DIST_ELECTRON = path.join(__dirname, '..');
process.env.DIST = path.join(process.env.DIST_ELECTRON, 'dist');
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, 'public')
  : process.env.DIST;

let win: BrowserWindow | null = null;
let store: ElectronStore;
let scannerService: ScannerService;
let dbService: DatabaseService;
let metadataProvider: IMetadataProvider;
let llmClient: OpenAIClient;
let llmEngine: LLMEngine;
let regexEngine: RegexEngine;

function buildMetadataProvider() {
  const currentTmdbKey = store.get('tmdb_api_key') as string || '';
  const currentProxyUrl = store.get('proxy_url') as string || '';
  const provider = MetadataFactory.create('tmdb', { apiKey: currentTmdbKey });

  provider.setProxy?.(currentProxyUrl);

  return provider;
}

function syncMetadataProvider() {
  metadataProvider = buildMetadataProvider();

  if (scannerService) {
    scannerService.setMetadataProvider(metadataProvider);
    scannerService.setProxy(store.get('proxy_url') as string || '');
  }
}

function registerIpcHandlers() {
  const imageFilePattern = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

  ipcMain.handle('config:get', (_, key: ConfigKey) => {
    return store.get(key) as ConfigValueMap[typeof key] | undefined;
  });
  ipcMain.handle('config:set', async (_, key: ConfigKey, value: ConfigValueMap[typeof key]) => {
    store.set(key, value);
    if (key === 'proxy_url') {
      const proxyValue = value as ConfigValueMap['proxy_url'];
      if (win) {
        if (proxyValue) {
          await win.webContents.session.setProxy({ proxyRules: proxyValue });
        } else {
          await win.webContents.session.setProxy({});
        }
      }
      if (scannerService) scannerService.setProxy(proxyValue);
    }
    if (key === 'log_level' && scannerService) {
      scannerService.setLogLevel(value as ConfigValueMap['log_level']);
    }
    if ((key === 'tmdb_api_key' || key === 'proxy_url') && scannerService) {
      syncMetadataProvider();
    }
  });

  ipcMain.handle('llm:test', async (_, config: LlmTestRequest) => {
    try {
      const testClient = new OpenAIClient();
      testClient.configure({ apiKey: config.apiKey, baseURL: config.baseURL, model: 'gpt-3.5-turbo' });
      const models = await testClient.listModels();
      return { success: true, models };
    } catch (error) {
      return toErrorResponse(error, 'LLM 连接测试失败');
    }
  });

  ipcMain.handle('tmdb:test', async (_, token) => {
    try {
      const proxyUrl = store.get('proxy_url') as string;
      const client = FetchClient.create({ proxyUrl, timeout: 5000 });
      const response = await client.get<{ success?: boolean; status_message?: string }>('https://api.themoviedb.org/3/authentication', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      });
      return { success: response.data?.success };
    } catch (error) {
      return {
        success: false,
        error: getNestedErrorMessage(
          error,
          (value) => {
            const data = value.response?.data;
            return typeof data === 'object' && data !== null && 'status_message' in data
              ? String((data as { status_message?: string }).status_message ?? '')
              : undefined;
          },
          'TMDB 连接测试失败',
        ),
      };
    }
  });

  ipcMain.handle('proxy:test', async () => {
    try {
      const proxyUrl = store.get('proxy_url') as string;
      const client = FetchClient.create({ proxyUrl, timeout: 5000 });
      await client.get('https://www.gstatic.com/generate_204');
      return { success: true };
    } catch (error) {
      return toErrorResponse(error, '代理连接测试失败');
    }
  });

  ipcMain.handle('openlist:test', async (_, config: OpenListTestRequest) => {
    try {
      const proxyUrl = store.get('proxy_url') as string;
      const client = FetchClient.create({ proxyUrl, timeout: 5000 });
      const baseURL = config.url.replace(/\/$/, '');
      const response = await client.get<OpenListResponse>(`${baseURL}/api/me`, {
        headers: { 'Authorization': config.token }
      });
      return { success: response.status === 200 && response.data?.code === 200 };
    } catch (error) {
      return {
        success: false,
        error: getNestedErrorMessage(
          error,
          (value) => {
            const data = value.response?.data;
            return typeof data === 'object' && data !== null && 'message' in data
              ? String((data as { message?: string }).message ?? '')
              : undefined;
          },
          'OpenList 连接测试失败',
        ),
      };
    }
  });

  ipcMain.handle('explorer:list', async (_, { type, path: targetPath, config }: ExplorerListRequest) => {
    try {
      if (type === 'local') {
        const fullPath = targetPath || config.localPath;
        if (!fullPath || !await fs.pathExists(fullPath)) return { success: false, error: '路径不存在' };
        const items = await fs.readdir(fullPath, { withFileTypes: true });
        const data = await Promise.all(items.map(async (item) => {
          const itemPath = path.join(fullPath, item.name);
          const stats = await fs.stat(itemPath);
          const previewUrl = item.isFile() && imageFilePattern.test(item.name)
            ? pathToFileURL(itemPath).href
            : undefined;
          return {
            name: item.name,
            path: itemPath,
            isDir: item.isDirectory(),
            size: item.isFile() ? stats.size : 0,
            mtime: stats.mtime.toISOString(),
            previewUrl,
          };
        }));
        data.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
        return { success: true, data, currentPath: fullPath };
      }
      else if (type === 'openlist') {
        if (!config.openListUrl) {
          return { success: false, error: 'OpenList 地址未配置' };
        }
        const proxyUrl = store.get('proxy_url') as string;
        const client = FetchClient.create({ proxyUrl });
        const baseURL = config.openListUrl.replace(/\/$/, '');
        const reqPath = targetPath || '/';
        const response = await client.post<OpenListResponse<OpenListListResponseData>>(
          `${baseURL}/api/fs/list`,
          { path: reqPath, password: "", page: 1, per_page: 0, refresh: true },
          { headers: { 'Authorization': config.openListToken ?? '' } },
        );
        if (response.data.code !== 200) return { success: false, error: response.data.message };
        const content = response.data.data?.content || [];
        const items = content.map((item) => ({
          name: item.name,
          path: path.posix.join(reqPath, item.name),
          isDir: item.is_dir,
          size: item.size,
          mtime: item.modified,
          previewUrl: item.thumb,
        }));
        items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
        return { success: true, data: items, currentPath: reqPath };
      }
      return { success: false, error: '未知的数据源类型' };
    } catch (error) {
      return toErrorResponse(error, '目录加载失败');
    }
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle('system:openExternal', async (_, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:maximize', () => win?.isMaximized() ? win.unmaximize() : win?.maximize());
  ipcMain.on('window:close', () => win?.close());

  ipcMain.handle('scanner:start', async (_, sourceConfig: ScanSourceRequest) => {
    try {
      const source = SourceFactory.create(sourceConfig.type, sourceConfig.id, 'Source');
      const connectConfig = sourceConfig.type === 'local'
        ? { path: sourceConfig.rootPath || sourceConfig.path }
        : sourceConfig;
      const connected = await source.connect(connectConfig);
      if (!connected) return { success: false, error: '连接失败' };

      const currentOpenaiKey = store.get('openai_api_key') as string || '';
      const currentOpenaiBase = store.get('openai_base_url') as string || '';
      const currentOpenaiModel = store.get('openai_model') as string || '';
      const currentProxyUrl = store.get('proxy_url') as string || '';

      llmClient.configure({ apiKey: currentOpenaiKey, baseURL: currentOpenaiBase, model: currentOpenaiModel, proxyUrl: currentProxyUrl });
      syncMetadataProvider();

      // 设置 OpenList 批次大小
      const batchSize = store.get('openlist_batch_size') as string || '20';
      scannerService.setOpenListBatchSize(parseInt(batchSize, 10));

      const videoExtensions = store.get('video_extensions') as string || 'mkv,mp4,avi,mov,iso,rmvb';
      scannerService.scanSource(source, sourceConfig.path, videoExtensions).catch((error: unknown) => {
        console.error('Scan Error:', error);
      });
      return { success: true };
    } catch (error) {
      return toErrorResponse(error, '扫描启动失败');
    }
  });

  ipcMain.handle('scanner:scan-selected', async (_, sourceConfig: ScanSelectedRequest) => {
    try {
      const source = SourceFactory.create(sourceConfig.type, sourceConfig.id, 'Source');
      const connectConfig = sourceConfig.type === 'local'
        ? { path: sourceConfig.path }
        : sourceConfig;
      const connected = await source.connect(connectConfig);
      if (!connected) return { success: false, error: '连接失败' };

      const currentOpenaiKey = store.get('openai_api_key') as string || '';
      const currentOpenaiBase = store.get('openai_base_url') as string || '';
      const currentOpenaiModel = store.get('openai_model') as string || '';
      const currentProxyUrl = store.get('proxy_url') as string || '';

      llmClient.configure({ apiKey: currentOpenaiKey, baseURL: currentOpenaiBase, model: currentOpenaiModel, proxyUrl: currentProxyUrl });
      syncMetadataProvider();

      // 设置 OpenList 批次大小
      const batchSize = store.get('openlist_batch_size') as string || '20';
      scannerService.setOpenListBatchSize(parseInt(batchSize, 10));

      const videoExtensions = store.get('video_extensions') as string || 'mkv,mp4,avi,mov,iso,rmvb';
      scannerService.scanSelectedFiles(source, sourceConfig.paths, videoExtensions).catch((error: unknown) => {
        console.error('Scan Selected Error:', error);
      });
      return { success: true };
    } catch (error) {
      return toErrorResponse(error, '选中文件扫描启动失败');
    }
  });

  ipcMain.handle('scanner:cancel', async () => {
    scannerService.requestCancel();
    return { success: true };
  });

  ipcMain.handle('scanner:identify-single', async (_, sourceConfig: ScanSourceRequest) => {
    try {
      const source = SourceFactory.create(sourceConfig.type, sourceConfig.id, 'Source');
      const connectConfig = sourceConfig.type === 'local'
        ? { path: sourceConfig.rootPath || sourceConfig.path }
        : sourceConfig;
      const connected = await source.connect(connectConfig);
      if (!connected) return { success: false, error: '连接失败' };

      const currentOpenaiKey = store.get('openai_api_key') as string || '';
      const currentOpenaiBase = store.get('openai_base_url') as string || '';
      const currentOpenaiModel = store.get('openai_model') as string || '';
      const currentProxyUrl = store.get('proxy_url') as string || '';

      llmClient.configure({ apiKey: currentOpenaiKey, baseURL: currentOpenaiBase, model: currentOpenaiModel, proxyUrl: currentProxyUrl });
      syncMetadataProvider();

      // 设置 OpenList 批次大小
      const batchSize = store.get('openlist_batch_size') as string || '20';
      scannerService.setOpenListBatchSize(parseInt(batchSize, 10));

      const videoExtensions = store.get('video_extensions') as string || 'mkv,mp4,avi,mov,iso,rmvb';
      scannerService.identifySingleFile(source, sourceConfig.path, videoExtensions).catch((error: unknown) => {
        console.error('Identify Error:', error);
      });
      return { success: true };
    } catch (error) {
      return toErrorResponse(error, '单文件识别启动失败');
    }
  });

  ipcMain.handle('media:getAll', () => dbService.getAllMedia());
  ipcMain.handle('metadata:getEpisodeDetail', async (_, { showId, season, episode }) => {
    return await metadataProvider.getEpisodeDetails(showId, season, episode);
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('scanner:fetch-metadata', async (event, { matches, seriesId }: FetchMetadataRequest) => {
    try {
      const total = matches.length;
      console.log(`[元数据获取] 开始获取 ${total} 个文件的元数据，seriesId: ${seriesId}`);

      const updatedMatches: EpisodeMatchItem[] = [];
      let completed = 0;
      const concurrencyLimit = 10; // 并发限制为10个请求

      // 发送初始进度
      event.sender.send('metadata-progress', { current: 0, total });

      // 批量处理函数
      const processBatch = async (items: EpisodeMatchItem[]) => {
        const promises = items.map(async (item) => {
          try {
            const metadata = await metadataProvider.getEpisodeDetails(
              seriesId,
              item.match.season ?? 1,
              item.match.episode ?? 1
            );

            completed++;
            // 发送进度更新
            event.sender.send('metadata-progress', { current: completed, total });

            return {
              ...item,
              match: {
                ...item.match,  // 保留所有原有字段，包括 totalEpisodes, originalEpisode 等
              },
              metadata: metadata || undefined
            };
          } catch (error) {
            console.error(`Failed to fetch metadata for ${item.file.name}:`, error);
            completed++;
            event.sender.send('metadata-progress', { current: completed, total });
            return item;
          }
        });

        return await Promise.all(promises);
      };

      // 分批处理
      for (let i = 0; i < matches.length; i += concurrencyLimit) {
        const batch = matches.slice(i, i + concurrencyLimit);
        const batchNum = Math.floor(i / concurrencyLimit) + 1;
        const totalBatches = Math.ceil(matches.length / concurrencyLimit);
        console.log(`[元数据获取] 批次 ${batchNum}/${totalBatches} (共 ${batch.length} 集)`);
        const batchResults = await processBatch(batch);
        updatedMatches.push(...batchResults);
      }

      console.log(`[元数据获取] 完成！共处理 ${total} 个文件`);
      return { success: true, matches: updatedMatches };
    } catch (error) {
      console.error('[元数据获取] 错误:', error);
      return toErrorResponse(error, '元数据获取失败');
    }
  });

  ipcMain.handle('scanner:smart-identify', async (_, { unmatchedFiles }: SmartIdentifyRequest) => {
    try {
      const results: EpisodeMatchItem[] = [];

      for (const fileData of unmatchedFiles) {
        try {
          // 尝试 LLM 识别
          const match = await llmEngine.match(fileData.file.name);
          results.push({
            ...fileData,
            match: match.success ? match : {
              success: false,
              seriesName: null,
              season: null,
              episode: null,
              source: 'llm_failed'
            }
          });
        } catch (error) {
          console.error(`LLM识别失败: ${fileData.file.name}:`, error);
          results.push({
            ...fileData,
            match: { success: false, source: 'llm_error' }
          });
        }
      }

      return { success: true, results };
    } catch (error) {
      return toErrorResponse(error, '智能识别失败');
    }
  });

  ipcMain.handle('rules:get', async () => {
    const defaultPath = path.join(process.env.DIST_ELECTRON || '', 'resources/default_rules.json');
    const userPath = path.join(app.getPath('userData'), 'custom_rules.json');

    let rules: RuleDefinition[] = [];
    if (await fs.pathExists(defaultPath)) rules = await fs.readJSON(defaultPath);

    if (await fs.pathExists(userPath)) {
      const userRules = await fs.readJSON(userPath) as RuleDefinition[];
      // Deduplicate by ID: User rules take precedence
      const ruleMap = new Map<string, RuleDefinition>();
      rules.forEach(r => ruleMap.set(r.id, r));
      userRules.forEach((rule) => ruleMap.set(rule.id, rule));
      rules = Array.from(ruleMap.values());
    }
    return rules;
  });

  ipcMain.handle('rules:save', async (_, rules: RuleDefinition[]) => {
    const userPath = path.join(app.getPath('userData'), 'custom_rules.json');
    await fs.writeJSON(userPath, rules, { spaces: 2 });
    return { success: true };
  });
}

function createWindow() {
  const appRoot = path.join(process.env.DIST_ELECTRON || '', '..');
  const iconIco = path.join(appRoot, 'build', 'icon.ico');
  const iconPng = path.join(appRoot, 'public', 'app-icon.png');
  const iconPath = process.platform === 'win32' && fs.existsSync(iconIco)
    ? iconIco
    : iconPng;

  win = new BrowserWindow({
    title: 'OpenList Scraper',
    icon: nativeImage.createFromPath(iconPath),
    frame: false,
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  scannerService.setMainWindow(win);
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(process.env.DIST || '', 'index.html'));
}

function handleStartupError(error: unknown) {
  console.error('[Startup] Failed to initialize application', error);

  const message = error instanceof NativeDependencyError
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error);

  dialog.showErrorBox('OpenList Scraper 启动失败', message);
  app.quit();
}

// Update Service
import { UpdateService } from './services/UpdateService';
let updateService: UpdateService;

app.whenReady().then(() => {
  try {
    // 2. Initialize store AFTER app name is set
    store = new ElectronStore({ name: 'settings' });

    // 3. Initialize all services
    dbService = new DatabaseService();
    regexEngine = new RegexEngine(path.join(process.env.DIST_ELECTRON || '', 'resources/default_rules.json'));
    llmClient = new OpenAIClient();
    llmEngine = new LLMEngine(llmClient);

    metadataProvider = buildMetadataProvider();

    scannerService = new ScannerService(regexEngine, llmEngine, metadataProvider, dbService);

    const savedLogLevel = store.get('log_level') as LogLevel || 'info';
    scannerService.setLogLevel(savedLogLevel);

    syncMetadataProvider();

    // Initialize Update Service
    updateService = new UpdateService();

    ipcMain.handle('update:check', async () => {
      return await updateService.checkUpdate();
    });

    ipcMain.handle('update:download', async () => {
      return await updateService.downloadUpdate();
    });

    ipcMain.handle('update:install', () => {
      updateService.installUpdate();
    });

    if (process.platform === 'win32') {
      app.setAppUserModelId('com.openlist.scraper');
    }

    registerIpcHandlers();
    createWindow();

    // Set window for update service
    if (win) updateService.setMainWindow(win);
  } catch (error) {
    handleStartupError(error);
  }
}).catch((error) => {
  handleStartupError(error);
});
