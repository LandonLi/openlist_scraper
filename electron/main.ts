import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import ElectronStore from 'electron-store';
import fs from 'fs-extra';

// Core Services
import { ScannerService } from './services/ScannerService';
import { DatabaseService } from './services/DatabaseService';

// Core Logic
import { RegexEngine } from './matchers/RegexEngine';
import { LLMEngine } from './matchers/LLMEngine';
import { OpenAIClient } from './llm/OpenAIClient';
import { MetadataFactory } from './metadata/factory';
import { SourceFactory } from './sources/factory';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. MUST set name before everything else to stabilize userData directory
app.setName('OpenListScraper'); 

process.env.DIST_ELECTRON = path.join(__dirname, '..');
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist');
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST;

let win: BrowserWindow | null = null;
let store: ElectronStore;
let scannerService: ScannerService;
let dbService: DatabaseService;
let metadataProvider: any;
let llmClient: OpenAIClient;
let llmEngine: LLMEngine;
let regexEngine: RegexEngine;

function registerIpcHandlers() {
  ipcMain.handle('config:get', (_, key) => store.get(key));
  ipcMain.handle('config:set', async (_, key, value) => {
    store.set(key, value);
    if (key === 'proxy_url') {
       if (win) value ? await win.webContents.session.setProxy({ proxyRules: value as string }) : await win.webContents.session.setProxy({});
    }
  });

  ipcMain.handle('llm:test', async (_, config) => {
    try {
      const testClient = new OpenAIClient();
      testClient.configure({ apiKey: config.apiKey, baseURL: config.baseURL, model: 'gpt-3.5-turbo' });
      const models = await testClient.listModels();
      return { success: true, models };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('tmdb:test', async (_, token) => {
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get('https://api.themoviedb.org/3/authentication', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      });
      return { success: response.data?.success };
    } catch (e: any) { return { success: false, error: e.response?.data?.status_message || e.message }; }
  });

  ipcMain.handle('proxy:test', async () => {
    try {
      const { default: axios } = await import('axios');
      await axios.get('https://www.gstatic.com/generate_204', { timeout: 5000 });
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('openlist:test', async (_, config) => {
    try {
      const { default: axios } = await import('axios');
      const baseURL = config.url.replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/api/me`, {
        headers: { 'Authorization': config.token },
        timeout: 5000
      });
      return { success: response.status === 200 && response.data?.code === 200 };
    } catch (e: any) { return { success: false, error: e.response?.data?.message || e.message }; }
  });

  ipcMain.handle('explorer:list', async (_, { type, path: targetPath, config }) => {
    try {
      if (type === 'local') {
        const fullPath = targetPath || config.localPath;
        if (!fullPath || !await fs.pathExists(fullPath)) return { success: false, error: '路径不存在' };
        const items = await fs.readdir(fullPath, { withFileTypes: true });
        const data = items.map(item => ({ name: item.name, path: path.join(fullPath, item.name), isDir: item.isDirectory(), size: 0 }));
        data.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
        return { success: true, data, currentPath: fullPath };
      } 
      else if (type === 'openlist') {
        const { default: axios } = await import('axios');
        const baseURL = config.openListUrl.replace(/\/$/, '');
        const reqPath = targetPath || '/';
        const response = await axios.post(`${baseURL}/api/fs/list`, { path: reqPath, password: "", page: 1, per_page: 0, refresh: true }, { headers: { 'Authorization': config.openListToken } });
        if (response.data.code !== 200) return { success: false, error: response.data.message };
        const content = response.data.data.content || [];
        const items = content.map((item: any) => ({ name: item.name, path: path.posix.join(reqPath, item.name), isDir: item.is_dir, size: item.size }));
        items.sort((a: any, b: any) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
        return { success: true, data: items, currentPath: reqPath };
      }
      return { success: false, error: '未知的数据源类型' };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return canceled ? null : filePaths[0];
  });

  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:maximize', () => win?.isMaximized() ? win.unmaximize() : win?.maximize());
  ipcMain.on('window:close', () => win?.close());

  ipcMain.handle('scanner:start', async (_, sourceConfig) => {
    try {
      const source = SourceFactory.create(sourceConfig.type, sourceConfig.id, 'Source');
      const connected = await source.connect(sourceConfig);
      if (!connected) return { success: false, error: '连接失败' };
      
      const currentTmdbKey = store.get('tmdb_api_key') as string || '';
      const currentOpenaiKey = store.get('openai_api_key') as string || '';
      const currentOpenaiBase = store.get('openai_base_url') as string || '';
      const currentOpenaiModel = store.get('openai_model') as string || '';

      llmClient.configure({ apiKey: currentOpenaiKey, baseURL: currentOpenaiBase, model: currentOpenaiModel });
      const newMetadataProvider = MetadataFactory.create('tmdb', { apiKey: currentTmdbKey });
      scannerService.setMetadataProvider(newMetadataProvider);

      const videoExtensions = store.get('video_extensions') as string || 'mkv,mp4,avi,mov,iso,rmvb';
      scannerService.scanSource(source, sourceConfig.path, videoExtensions).catch(err => console.error('Scan Error:', err));
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('scanner:scan-selected', async (_, sourceConfig) => {
    try {
      const source = SourceFactory.create(sourceConfig.type, sourceConfig.id, 'Source');
      const connected = await source.connect(sourceConfig);
      if (!connected) return { success: false, error: '连接失败' };
      
      const currentTmdbKey = store.get('tmdb_api_key') as string || '';
      const currentOpenaiKey = store.get('openai_api_key') as string || '';
      const currentOpenaiBase = store.get('openai_base_url') as string || '';
      const currentOpenaiModel = store.get('openai_model') as string || '';

      llmClient.configure({ apiKey: currentOpenaiKey, baseURL: currentOpenaiBase, model: currentOpenaiModel });
      const newMetadataProvider = MetadataFactory.create('tmdb', { apiKey: currentTmdbKey });
      scannerService.setMetadataProvider(newMetadataProvider);

      const videoExtensions = store.get('video_extensions') as string || 'mkv,mp4,avi,mov,iso,rmvb';
      scannerService.scanSelectedFiles(source, sourceConfig.paths, videoExtensions).catch(err => console.error('Scan Selected Error:', err));
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('scanner:identify-single', async (_, sourceConfig) => {
    try {
      const source = SourceFactory.create(sourceConfig.type, sourceConfig.id, 'Source');
      const connected = await source.connect(sourceConfig);
      if (!connected) return { success: false, error: '连接失败' };
      
      const currentTmdbKey = store.get('tmdb_api_key') as string || '';
      const currentOpenaiKey = store.get('openai_api_key') as string || '';
      const currentOpenaiBase = store.get('openai_base_url') as string || '';
      const currentOpenaiModel = store.get('openai_model') as string || '';

      llmClient.configure({ apiKey: currentOpenaiKey, baseURL: currentOpenaiBase, model: currentOpenaiModel });
      const newMetadataProvider = MetadataFactory.create('tmdb', { apiKey: currentTmdbKey });
      scannerService.setMetadataProvider(newMetadataProvider);

      const videoExtensions = store.get('video_extensions') as string || 'mkv,mp4,avi,mov,iso,rmvb';
      scannerService.identifySingleFile(source, sourceConfig.path, videoExtensions).catch(err => console.error('Identify Error:', err));
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('media:getAll', () => dbService.getAllMedia());
  ipcMain.handle('metadata:getEpisodeDetail', async (_, { showId, season, episode }) => {
    return await metadataProvider.getEpisodeDetails(showId, season, episode);
  });

  ipcMain.handle('rules:get', async () => {
    const defaultPath = path.join(process.env.DIST_ELECTRON || '', 'resources/default_rules.json');
    const userPath = path.join(app.getPath('userData'), 'custom_rules.json');
    let rules = [];
    if (await fs.pathExists(defaultPath)) rules = await fs.readJSON(defaultPath);
    if (await fs.pathExists(userPath)) {
        const userRules = await fs.readJSON(userPath);
        rules = [...userRules, ...rules];
    }
    return rules;
  });

  ipcMain.handle('rules:save', async (_, rules) => {
    const userPath = path.join(app.getPath('userData'), 'custom_rules.json');
    await fs.writeJSON(userPath, rules, { spaces: 2 });
    return { success: true };
  });
}

function createWindow() {
  const iconPng = path.join(process.env.PUBLIC || '', 'app-icon.png');
  const iconSvg = path.join(process.env.PUBLIC || '', 'app-icon.svg');
  const iconPath = fs.existsSync(iconPng) ? iconPng : iconSvg;
  
  win = new BrowserWindow({
    title: 'OpenList Scraper',
    icon: iconPath,
    frame: false,
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

app.whenReady().then(() => {
  // 2. Initialize store AFTER app name is set
  store = new ElectronStore({ name: 'settings' });
  
  // 3. Initialize all services
  dbService = new DatabaseService();
  regexEngine = new RegexEngine(path.join(process.env.DIST_ELECTRON || '', 'resources/default_rules.json'));
  llmClient = new OpenAIClient();
  llmEngine = new LLMEngine(llmClient);
  
  const tmdbKeyInitial = store.get('tmdb_api_key') as string || '';
  metadataProvider = MetadataFactory.create('tmdb', { apiKey: tmdbKeyInitial });
  
  scannerService = new ScannerService(regexEngine, llmEngine, metadataProvider, dbService);

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.openlist.scraper');
  }
  
  registerIpcHandlers();
  createWindow();
});