import { useEffect, useState } from 'react';
import { useAppStore, LogType } from './stores/appStore';
import { Settings, Database, Globe, Play, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, Save, ArrowRight, Minus, Square, X, Folder, Network, Zap, File, Clapperboard, ChevronUp, ChevronDown, LayoutGrid, List, Wand2, Sun, Moon, ArrowLeft, CornerLeftUp, Check, Calendar, Clock, Trash2, Download } from 'lucide-react';
import clsx from 'clsx';

const StatusMessage = ({ result }: { result: { success: boolean; message: string } | null }) => {
  if (!result) return null;
  return (
    <div className={clsx("text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in slide-in-from-left-1", result.success ? "text-green-500" : "text-red-500")}>
      {result.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
      {result.message}
    </div>
  );
};

const TestButton = ({ onClick, loading, label = "测试连接" }: { onClick: () => void, loading: boolean, label?: string }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className="h-9 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-2 border border-slate-200 dark:border-slate-700 disabled:opacity-50"
  >
    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
    {label}
  </button>
);

const LogItem = ({ log }: { log: { message: string, type: LogType, timestamp: number } }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = log.message.length > 300 || log.message.split('\n').length > 5;
  const showContent = expanded || !isLong ? log.message : log.message.substring(0, 300) + '...';

  return (
    <div
      className={clsx(
        "flex gap-2 group p-1.5 rounded-md transition-all border border-transparent hover:shadow-sm relative",
        "hover:bg-white dark:hover:bg-slate-800 hover:border-slate-100 dark:hover:border-slate-700"
      )}
    >
      <span className="text-slate-400/50 text-[10px] shrink-0 font-mono py-0.5 pointer-events-none select-none">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>

      <span className={clsx(
        "text-[9px] px-1 py-0.5 rounded font-black uppercase tracking-wider shrink-0 w-12 text-center select-none flex items-center justify-center h-fit mt-0.5",
        log.type === 'debug' && "bg-slate-100 dark:bg-slate-800 text-slate-400",
        log.type === 'info' && "bg-blue-50 dark:bg-blue-900/20 text-blue-500",
        log.type === 'success' && "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500",
        log.type === 'warn' && "bg-amber-50 dark:bg-amber-900/20 text-amber-500",
        log.type === 'error' && "bg-rose-50 dark:bg-rose-900/20 text-rose-500",
      )}>
        {log.type}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span
          className={clsx(
            "break-all text-xs leading-relaxed font-medium font-sans cursor-pointer hover:opacity-80 active:scale-[0.99] transition-transform origin-left",
            log.type === 'debug' && "text-slate-400 font-mono text-[10px]",
            log.type === 'info' && "text-slate-600 dark:text-slate-300",
            log.type === 'success' && "text-emerald-600 dark:text-emerald-400",
            log.type === 'warn' && "text-amber-600 dark:text-amber-400",
            log.type === 'error' && "text-rose-600 dark:text-rose-400"
          )}
          onClick={() => navigator.clipboard.writeText(log.message)}
          title="点击复制内容"
        >
          {log.type === 'debug' ? (
            <span className="whitespace-pre-wrap">{showContent}</span>
          ) : showContent}
        </span>

        {isLong && (
          <div className={clsx("flex justify-start", expanded && "sticky bottom-0 left-0 w-full pt-2 pb-1 bg-gradient-to-t from-white dark:from-slate-900 to-transparent z-10")}>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className={clsx(
                "text-[10px] font-bold text-slate-400 hover:text-blue-500 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shadow-sm",
                expanded && "shadow-md border border-slate-200 dark:border-slate-700"
              )}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? '收起' : '展开'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const {
    tmdbKey, openaiKey, openaiBaseUrl, openaiModel,
    sourceType, localPath, openListUrl, openListToken,
    logs, isScanning,
    setConfig, setVideoExtensions, addLog, clearLogs, setScanning, setMedia
  } = useAppStore();

  // Navigation & UI Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [settingsTab, setSettingsTab] = useState<'general' | 'metadata' | 'llm' | 'library' | 'rules'>('general');

  // Explorer
  const [currentPath, setCurrentPath] = useState('');
  const [fileList, setFileList] = useState<Array<{ name: string, path: string, isDir: boolean, size: number }>>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [navHistory, setNavHistory] = useState<string[]>([]);

  // Selection State (Multi-select)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Settings inputs
  const [showTmdbKey, setShowTmdbKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showOpenListToken, setShowOpenListToken] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [rules, setRules] = useState<Array<{ id: string, pattern: string, type: string }>>([]);

  const [isTestingLLM, setIsTestingLLM] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isTestingTmdb, setIsTestingTmdb] = useState(false);
  const [tmdbTestResult, setTmdbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingOpenList, setIsTestingOpenList] = useState(false);
  const [openListTestResult, setOpenListTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Wizard
  const [wizardStage, setWizardWizardStage] = useState<'idle' | 'series' | 'loading_episodes' | 'episodes' | 'executing' | 'finished'>('idle');
  const [wizardData, setWizardData] = useState<{ detectedName?: string, seriesResults?: any[], seriesName?: string, matches?: any[] }>({});
  const [scrapeProgress, setScrapeProgress] = useState<{ percent: number, message: string }>({ percent: 0, message: '' });
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [batchOptions, setBatchOptions] = useState({ rename: true, writeNfo: true, writePoster: true, writeStill: true });

  const [selectedEpisodeDetail, setSelectedEpisodeDetail] = useState<any | null>(null);
  const [, setLoadingDetail] = useState(false);
  const [editingMatchIndex, setEditingMatchIndex] = useState<number | null>(null);
  const [editMatchValues, setEditMatchValues] = useState({ season: 1, episode: 1 });
  const [manualSeriesName, setManualSeriesName] = useState('');

  // Local input mirror
  const [proxyInput, setProxyInput] = useState('');
  const [localPathInput, setLocalPathInput] = useState('');
  const [openListUrlInput, setOpenListUrlInput] = useState('');
  const [openListTokenInput, setOpenListTokenInput] = useState('');
  const [videoExtsInput, setVideoExtsInput] = useState('');

  // General Settings
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [logLevel, setLogLevel] = useState<'info' | 'warn' | 'error'>('info');

  // UI State
  const [showLogs, setShowLogs] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Update State
  const [appVersion, setAppVersion] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ currentVersion: string; latestVersion: string; releaseNote: string; assetUrl?: string } | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Initial Configuration Loading
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const version = await window.ipcRenderer.invoke('app:getVersion');
        setAppVersion(version);

        const tKey = await window.ipcRenderer.invoke('config:get', 'tmdb_api_key');
        const oKey = await window.ipcRenderer.invoke('config:get', 'openai_api_key');
        const oUrl = await window.ipcRenderer.invoke('config:get', 'openai_base_url');
        const oModel = await window.ipcRenderer.invoke('config:get', 'openai_model');
        const pUrl = await window.ipcRenderer.invoke('config:get', 'proxy_url');
        const sType = await window.ipcRenderer.invoke('config:get', 'source_type');
        const sPath = await window.ipcRenderer.invoke('config:get', 'local_path');
        const sUrl = await window.ipcRenderer.invoke('config:get', 'openlist_url');
        const sToken = await window.ipcRenderer.invoke('config:get', 'openlist_token');
        const vExts = await window.ipcRenderer.invoke('config:get', 'video_extensions');
        const vMode = await window.ipcRenderer.invoke('config:get', 'view_mode');
        const savedBatchOptions = await window.ipcRenderer.invoke('config:get', 'batch_options');
        const savedTheme = await window.ipcRenderer.invoke('config:get', 'theme');
        const savedLogLevel = await window.ipcRenderer.invoke('config:get', 'log_level');

        if (tKey) setConfig('tmdbKey', tKey);
        if (oKey) setConfig('openaiKey', oKey);
        if (oUrl) setConfig('openaiBaseUrl', oUrl);
        if (oModel) setConfig('openaiModel', oModel);
        if (pUrl) { setConfig('proxyUrl', pUrl); setProxyInput(pUrl); }
        if (sType) setConfig('sourceType', sType);
        if (sPath) { setConfig('localPath', sPath); setLocalPathInput(sPath); }
        if (sUrl) { setConfig('openListUrl', sUrl); setOpenListUrlInput(sUrl); }
        if (sToken) { setConfig('openListToken', sToken); setOpenListTokenInput(sToken); }
        if (vExts) { setVideoExtensions(vExts); setVideoExtsInput(vExts); }
        else { setVideoExtsInput('mkv,mp4,avi,mov,iso,rmvb'); }
        if (vMode) setViewMode(vMode);
        if (savedBatchOptions) setBatchOptions(savedBatchOptions);
        if (savedTheme) setTheme(savedTheme);
        if (savedLogLevel) setLogLevel(savedLogLevel);

        const initialRules = await window.ipcRenderer.invoke('rules:get') || [];
        setRules(Array.isArray(initialRules) ? initialRules : []);
        refreshMedia();
      } catch (err) {
        console.error('Error loading config:', err);
      }
    };

    const handleLog = (data: any) => addLog(data.message, data.type);
    const handleFinished = () => {
      setScanning(false);
      addLog('扫描任务全部完成。', 'success');
      refreshMedia();
    };
    const handleConfirmation = (data: any) => {
      setWizardData({ detectedName: data.detectedName, seriesResults: data.results });
      setManualSeriesName(data.detectedName); // Initialize with detected name
      setWizardWizardStage('series');
    };
    const handleEpisodesConfirmation = (data: any) => {
      setWizardData(prev => ({ ...prev, seriesName: data.seriesName, matches: data.matches }));
      setSelectedIndices(data.matches.map((_: any, i: number) => i));
      setWizardWizardStage('episodes');
    };
    const handleProgress = (data: any) => {
      setScrapeProgress({ percent: data.percent, message: data.message });
      if (data.finished) setWizardWizardStage('finished');
    };

    const handleDownloadProgress = (data: any) => {
      setDownloadProgress(Number(data.percent));
    };

    const cleanupLog = window.ipcRenderer.on('scanner-log', handleLog);
    const cleanupFinished = window.ipcRenderer.on('scanner-finished', handleFinished);
    const cleanupConf = window.ipcRenderer.on('scanner-require-confirmation', handleConfirmation);
    const cleanupEpConf = window.ipcRenderer.on('scanner-require-episodes-confirmation', handleEpisodesConfirmation);
    const cleanupProgress = window.ipcRenderer.on('scanner-operation-progress', handleProgress);
    const cleanupDlProgress = window.ipcRenderer.on('update:download-progress', handleDownloadProgress);

    loadConfig();
    return () => {
      if (typeof cleanupLog === 'function') (cleanupLog as any)();
      if (typeof cleanupFinished === 'function') (cleanupFinished as any)();
      if (typeof cleanupConf === 'function') (cleanupConf as any)();
      if (typeof cleanupEpConf === 'function') (cleanupEpConf as any)();
      if (typeof cleanupProgress === 'function') (cleanupProgress as any)();
      if (typeof cleanupDlProgress === 'function') (cleanupDlProgress as any)();
    };
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [theme]);

  // Handlers
  const handleConfirmSeries = (seriesId: string | null) => {
    // 找到用户选择的剧集对象,提取剧集名称
    const selected = seriesId ? wizardData.seriesResults?.find((r: any) => r.id === seriesId) : null;

    window.ipcRenderer.send('scanner-confirm-response', {
      seriesId,
      seriesName: selected?.title // 添加用户确认的剧集名称
    });

    if (!seriesId) {
      setWizardWizardStage('idle');
      setWizardData({});
    } else {
      setWizardWizardStage('loading_episodes');
    }
  };

  const handleManualSearch = () => {
    if (!manualSeriesName.trim()) return;

    // Send IPC request with new name
    window.ipcRenderer.send('scanner-confirm-response', { seriesId: null, newName: manualSeriesName });

    // Set to undefined to indicate loading state (distinct from empty array which means no results)
    setWizardData(prev => ({ ...prev, seriesResults: undefined }));
  };

  const handleConfirmEpisodes = (confirmed: boolean) => {
    if (!confirmed) {
      window.ipcRenderer.send('scanner-episodes-confirm-response', { confirmed: false, options: {}, selectedIndices: [] });
      setWizardWizardStage('idle'); setWizardData({});
    } else {
      setWizardWizardStage('executing');
      setScrapeProgress({ percent: 0, message: '正在初始化操作...' });
      window.ipcRenderer.send('scanner-episodes-confirm-response', { confirmed: true, options: batchOptions, selectedIndices: selectedIndices, updatedMatches: wizardData.matches });
    }
  };

  const closeWizard = () => {
    if (wizardStage === 'series') {
      window.ipcRenderer.send('scanner-confirm-response', { seriesId: null });
    }
    if (wizardStage === 'episodes') {
      window.ipcRenderer.send('scanner-episodes-confirm-response', { confirmed: false, options: {}, selectedIndices: [] });
    }

    setWizardWizardStage('idle');
    setWizardData({});
    setScrapeProgress({ percent: 0, message: '' });

    if (wizardStage === 'finished') {
      setScanning(false);
    }
  };

  const handleManualMatchUpdate = async () => {
    if (editingMatchIndex === null || !wizardData.matches) return;

    const item = wizardData.matches[editingMatchIndex];
    const newMatches = [...wizardData.matches];

    newMatches[editingMatchIndex] = {
      ...item,
      match: { ...item.match, season: editMatchValues.season, episode: editMatchValues.episode }
    };

    setWizardData(prev => ({ ...prev, matches: newMatches }));
    setEditingMatchIndex(null);

    try {
      const metadata = await window.ipcRenderer.invoke('metadata:getEpisodeDetail', {
        showId: item.tmdbId,
        season: editMatchValues.season,
        episode: editMatchValues.episode
      });
      if (metadata) {
        const updatedMatchesWithMeta = [...newMatches];
        updatedMatchesWithMeta[editingMatchIndex] = {
          ...updatedMatchesWithMeta[editingMatchIndex],
          metadata: metadata
        };
        setWizardData(prev => ({ ...prev, matches: updatedMatchesWithMeta }));
      }
    } catch (e) {
      console.error('Failed to fetch metadata for manual match:', e);
    }
  };

  const handleNavigate = (path: string) => {
    loadDirectory(path);
  };

  const loadDirectory = async (path: string, options?: { isBack?: boolean }) => {
    setLoadingFiles(true);
    setFileList([]);
    setSelectedPaths(new Set());

    if (!options?.isBack && currentPath) {
      setNavHistory(prev => [...prev, currentPath]);
    }

    const result = await window.ipcRenderer.invoke('explorer:list', { type: sourceType, path, config: { localPath, openListUrl, openListToken } });
    if (result.success) { setFileList(result.data); setCurrentPath(result.currentPath); }
    else { addLog(`无法加载目录: ${result.error}`, 'error'); }
    setLoadingFiles(false);
  };

  const handleGoBack = () => {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory(prev => prev.slice(0, -1));
    loadDirectory(prev, { isBack: true });
  };

  const handleGoUp = () => {
    if (!currentPath || currentPath === '/' || currentPath === localPath) return;
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parent = currentPath.split(sep).slice(0, -1).join(sep) || (sep === '/' ? '/' : '');
    loadDirectory(parent);
  };

  const handleStartScan = async () => {
    if (isScanning) return;
    setScanning(true);

    if (selectedPaths.size > 0) {
      const paths = Array.from(selectedPaths);
      addLog(`正在为 ${paths.length} 个选定项目开始匹配...`, 'info');
      const res = await window.ipcRenderer.invoke('scanner:scan-selected', { type: sourceType, id: `src_${Date.now()}`, paths, url: openListUrl, token: openListToken });
      if (!res.success) { addLog(res.error, 'error'); setScanning(false); }
    } else {
      if (!currentPath) return;
      addLog(`开始递归扫描目录: ${currentPath}`, 'info');
      const res = await window.ipcRenderer.invoke('scanner:start', { type: sourceType, id: `src_${Date.now()}`, path: currentPath, url: openListUrl, token: openListToken });
      if (!res.success) { addLog(res.error, 'error'); setScanning(false); }
    }
  };

  const handleSaveConfig = async () => {
    setSaveStatus('saving');
    await window.ipcRenderer.invoke('config:set', 'tmdb_api_key', tmdbKey);
    await window.ipcRenderer.invoke('config:set', 'openai_api_key', openaiKey);
    await window.ipcRenderer.invoke('config:set', 'openai_base_url', openaiBaseUrl);
    await window.ipcRenderer.invoke('config:set', 'openai_model', openaiModel);
    await window.ipcRenderer.invoke('config:set', 'proxy_url', proxyInput);
    await window.ipcRenderer.invoke('config:set', 'source_type', sourceType);
    await window.ipcRenderer.invoke('config:set', 'local_path', localPathInput);
    await window.ipcRenderer.invoke('config:set', 'openlist_url', openListUrlInput);
    await window.ipcRenderer.invoke('config:set', 'openlist_token', openListTokenInput);
    await window.ipcRenderer.invoke('config:set', 'video_extensions', videoExtsInput);
    await window.ipcRenderer.invoke('config:set', 'theme', theme);
    await window.ipcRenderer.invoke('config:set', 'log_level', logLevel);
    await window.ipcRenderer.invoke('rules:save', rules);

    setConfig('proxyUrl', proxyInput); setConfig('localPath', localPathInput);
    setConfig('openListUrl', openListUrlInput); setConfig('openListToken', openListTokenInput);
    setVideoExtensions(videoExtsInput);
    setSaveStatus('saved'); addLog('设置已保存。', 'success');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleTestProxy = async () => {
    setIsTestingProxy(true); setProxyTestResult(null);
    const res = await window.ipcRenderer.invoke('proxy:test');
    if (res.success) setProxyTestResult({ success: true, message: '代理连接正常' });
    else setProxyTestResult({ success: false, message: res.error });
    setIsTestingProxy(false);
  };

  const handleBrowseLocal = async () => {
    const path = await window.ipcRenderer.invoke('dialog:openDirectory');
    if (path) setLocalPathInput(path);
  };

  const handleAddRule = () => {
    const newRule = { id: `rule_${Date.now()}`, pattern: '', type: 'tv' };
    setRules([...rules, newRule]);
  };

  const handleUpdateRule = (idx: number, field: string, value: string) => {
    const newRules = [...rules];
    (newRules[idx] as any)[field] = value;
    setRules(newRules);
  };

  const handleDeleteRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  const toggleOption = (id: 'rename' | 'writeNfo' | 'writePoster' | 'writeStill') => {
    setBatchOptions(prev => {
      const next = { ...prev, [id]: !prev[id] };
      window.ipcRenderer.invoke('config:set', 'batch_options', next);
      return next;
    });
  };

  const handleTestLLM = async () => {
    setIsTestingLLM(true); setLlmTestResult(null);
    const res = await window.ipcRenderer.invoke('llm:test', { apiKey: openaiKey, baseURL: openaiBaseUrl });
    if (res.success) { setAvailableModels(res.models); setLlmTestResult({ success: true, message: `连接成功! 获取到 ${res.models.length} 个模型。` }); }
    else setLlmTestResult({ success: false, message: res.error });
    setIsTestingLLM(false);
  };

  const handleTestTmdb = async () => {
    setIsTestingTmdb(true); setTmdbTestResult(null);
    const res = await window.ipcRenderer.invoke('tmdb:test', tmdbKey);
    if (res.success) setTmdbTestResult({ success: true, message: '令牌有效' });
    else setTmdbTestResult({ success: false, message: res.error });
    setIsTestingTmdb(false);
  };

  const handleTestOpenList = async () => {
    setIsTestingOpenList(true); setOpenListTestResult(null);
    const res = await window.ipcRenderer.invoke('openlist:test', { url: openListUrlInput, token: openListTokenInput });
    if (res.success) setOpenListTestResult({ success: true, message: '连接成功' });
    else setOpenListTestResult({ success: false, message: res.error });
    setIsTestingOpenList(false);
  };

  const handleShowEpisodeDetail = async (item: any) => {
    if (!item.metadata || !item.tmdbId) return;
    setLoadingDetail(true);
    setSelectedEpisodeDetail({ ...item.metadata, season: item.match.season, episode: item.match.episode });
    try {
      const fullData = await window.ipcRenderer.invoke('metadata:getEpisodeDetail', { showId: item.tmdbId, season: item.match.season, episode: item.match.episode });
      if (fullData) {
        setSelectedEpisodeDetail({
          ...fullData,
          season: item.match.season,
          episode: item.match.episode,
          overview: fullData.overview || item.metadata.overview || item.match.overview // Fallback to existing overview
        });
      }
    } catch (e) { console.error(e); } finally { setLoadingDetail(false); }
  };

  const toggleSelection = (path: string) => {
    const newSet = new Set(selectedPaths);
    if (newSet.has(path)) newSet.delete(path);
    else newSet.add(path);
    setSelectedPaths(newSet);
  };

  const toggleSelectAll = () => {
    const filesCount = fileList.filter(f => !f.isDir).length;
    if (selectedPaths.size === filesCount && selectedPaths.size > 0) {
      setSelectedPaths(new Set());
    } else {
      const newSet = new Set<string>();
      fileList.forEach(f => {
        if (!f.isDir) newSet.add(f.path);
      });
      setSelectedPaths(newSet);
    }
  };

  const toggleSelectIndicesAll = () => {
    if (!wizardData.matches) return;
    if (selectedIndices.length === wizardData.matches.length) setSelectedIndices([]);
    else setSelectedIndices(wizardData.matches.map((_, i) => i));
  };

  const toggleIndex = (idx: number) => {
    if (selectedIndices.includes(idx)) setSelectedIndices(selectedIndices.filter(i => i !== idx));
    else setSelectedIndices([...selectedIndices, idx]);
  };

  const refreshMedia = async () => { const allMedia = await window.ipcRenderer.invoke('media:getAll'); setMedia(allMedia); };
  const isConfigured = (sourceType === 'local' && localPath) || (sourceType === 'openlist' && openListUrl);

  const handleCheckUpdate = async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    addLog('正在检查更新...', 'info');
    try {
      const result = await window.ipcRenderer.invoke('update:check');
      if (result.hasUpdate) {
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          releaseNote: result.releaseNote || '暂无发布说明',
          assetUrl: result.assetUrl
        });
        setShowUpdateDialog(true);
        addLog(`发现新版本: v${result.latestVersion}`, 'success');
      } else {
        if (result.error) {
          addLog(`检查更新失败: ${result.error}`, 'error');
        } else {
          addLog('当前已是最新版本', 'success');
        }
      }
    } catch (e: any) {
      addLog(`检查更新出错: ${e.message}`, 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.assetUrl) return;
    setIsDownloadingUpdate(true);
    setDownloadProgress(0);
    addLog('开始下载更新...', 'info');
    try {
      const success = await window.ipcRenderer.invoke('update:download', updateInfo.assetUrl);
      if (success) {
        addLog('下载完成，正在重启安装...', 'success');
        window.ipcRenderer.invoke('update:install');
      } else {
        addLog('下载更新失败', 'error');
        setIsDownloadingUpdate(false);
      }
    } catch (e: any) {
      addLog(`更新失败: ${e.message}`, 'error');
      setIsDownloadingUpdate(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard' && !isScanning) {
      if ((sourceType === 'local' && localPath) || (sourceType === 'openlist' && openListUrl)) {
        loadDirectory(currentPath || (sourceType === 'local' ? localPath : ''));
      }
    }
  }, [activeTab, sourceType, localPath, openListUrl, isScanning]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Title Bar */}
      <div className="fixed top-0 left-0 right-0 h-8 z-[100] flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="px-3 flex items-center gap-2 text-[11px] font-bold text-slate-500 tracking-wider uppercase">
          <Clapperboard className="w-3.5 h-3.5 text-blue-500" />
          <span>OpenList 媒体整理</span>
          <button
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[9px] font-black text-slate-400 dark:text-slate-500 tracking-normal transition-colors cursor-pointer disabled:opacity-50"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="点击检查更新"
          >
            {isCheckingUpdate ? "Checking..." : (appVersion ? `V${appVersion}` : '...')}
          </button>
        </div>

        <div className="flex h-full items-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => setActiveTab(activeTab === 'settings' ? 'dashboard' : 'settings')}
            className={clsx(
              "h-full px-3 flex items-center gap-2 transition-colors",
              activeTab === 'settings' ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            )}
            title={activeTab === 'settings' ? "返回仪表盘" : "设置"}
          >
            {activeTab === 'settings' ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          </button>
          <div className="w-[1px] h-4 bg-slate-200 dark:border-slate-800 mx-1"></div>
          <button onClick={() => window.ipcRenderer.send('window:minimize')} className="px-3 h-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
          <button onClick={() => window.ipcRenderer.send('window:maximize')} className="px-3 h-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Square className="w-3 h-3" /></button>
          <button onClick={() => window.ipcRenderer.send('window:close')} className="px-3 h-full hover:bg-red-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Update Dialog */}
      {showUpdateDialog && updateInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-[480px] border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">发现新版本</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">v{updateInfo.currentVersion}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="font-mono bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-bold">v{updateInfo.latestVersion}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowUpdateDialog(false)} disabled={isDownloadingUpdate} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-5 h-5" /></button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3 max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-800">
              <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                {updateInfo.releaseNote}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowUpdateDialog(false)}
                disabled={isDownloadingUpdate}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                稍后提醒
              </button>
              <button
                onClick={handleDownloadUpdate}
                disabled={isDownloadingUpdate || !updateInfo.assetUrl}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                {isDownloadingUpdate ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Downloading {downloadProgress}%
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    立即更新
                  </>
                )}
              </button>
            </div>
            {isDownloadingUpdate && (
              <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${downloadProgress}%` }}></div>
              </div>
            )}
          </div>
        </div>
      )}


      <main className="flex-1 flex flex-col mt-8 overflow-hidden">
        {activeTab === 'dashboard' && (
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-950">
            {/* Toolbar / Address Bar */}
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-2 bg-white dark:bg-slate-900 shrink-0">
              {/* Nav Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleGoBack}
                  disabled={navHistory.length === 0}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-20 transition-colors"
                  title="返回"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
                <button
                  onClick={handleGoUp}
                  disabled={!currentPath || currentPath === '/' || currentPath === localPath}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-20 transition-colors"
                  title="上一级"
                >
                  <CornerLeftUp className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>

              <div className="flex-1 h-9 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center px-2 border border-slate-200 dark:border-slate-700 text-sm shadow-sm overflow-hidden">
                <div className="flex-1 flex items-center overflow-x-auto breadcrumb-scroll mask-linear-fade">
                  {isConfigured && (
                    <button
                      onClick={() => handleNavigate(sourceType === 'local' ? localPath : '')}
                      className={clsx(
                        "px-1.5 py-0.5 rounded-md hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm transition-all whitespace-nowrap border border-transparent hover:border-slate-200 dark:hover:border-slate-600 flex items-center gap-1",
                        (!currentPath || currentPath === '/' || currentPath === localPath) ? "font-bold text-slate-800 dark:text-slate-100 cursor-default" : "text-slate-500 hover:text-blue-600"
                      )}
                      disabled={!currentPath || currentPath === '/' || currentPath === localPath}
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>根目录</span>
                    </button>
                  )}
                  {currentPath && currentPath !== '/' && currentPath !== localPath ? (
                    currentPath.replace(localPath, '').split(/[\\/]/).filter(Boolean).map((part, index, arr) => {
                      const isLast = index === arr.length - 1;
                      return (
                        <div key={index} className="flex items-center text-xs">
                          <span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span>
                          <button
                            onClick={() => {
                              const sep = currentPath.includes('\\') ? '\\' : '/';
                              let parts = currentPath.split(sep).filter(Boolean);
                              const partIndex = parts.lastIndexOf(part);
                              let newPath = parts.slice(0, partIndex + 1).join(sep);
                              if (sep === '\\' && newPath.length === 2 && newPath.endsWith(':')) newPath += '\\';
                              if (sep === '/' && !newPath.startsWith('/')) newPath = '/' + newPath;
                              handleNavigate(newPath);
                            }}
                            className={clsx(
                              "px-1.5 py-0.5 rounded-md hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm transition-all whitespace-nowrap border border-transparent hover:border-slate-200 dark:hover:border-slate-600",
                              isLast ? "font-bold text-slate-800 dark:text-slate-100 cursor-default" : "text-slate-500 hover:text-blue-600"
                            )}
                            disabled={isLast}
                          >
                            {part}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    !isConfigured && <span className="text-slate-400 italic px-2">未配置</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700 h-9">
                  <button onClick={() => { setViewMode('grid'); window.ipcRenderer.invoke('config:set', 'view_mode', 'grid'); }} className={clsx("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200")}>
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setViewMode('list'); window.ipcRenderer.invoke('config:set', 'view_mode', 'list'); }} className={clsx("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200")}>
                    <List className="w-4 h-4" />
                  </button>
                </div>

                {!isConfigured ? (
                  <button onClick={() => { setActiveTab('settings'); setSettingsTab('library'); }} className="h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-all shadow-blue-500/20">
                    配置数据源 <ArrowRight className="w-3 h-3" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={toggleSelectAll} className="h-9 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-all">
                      <div className={clsx(
                        "w-3.5 h-3.5 rounded border flex items-center justify-center transition-all",
                        selectedPaths.size > 0 ? "bg-blue-500 border-blue-500" : "border-slate-400"
                      )}>
                        {selectedPaths.size > 0 && (
                          selectedPaths.size === fileList.filter(f => !f.isDir).length
                            ? <Check className="w-2.5 h-2.5 text-white" />
                            : <Minus className="w-2.5 h-2.5 text-white" />
                        )}
                      </div>
                      {selectedPaths.size > 0 && selectedPaths.size === fileList.filter(f => !f.isDir).length ? '取消全选' : '全选'}
                    </button>

                    <button onClick={handleStartScan} disabled={isScanning || (!currentPath && selectedPaths.size === 0)} className={clsx("h-9 px-4 rounded-lg text-xs font-bold flex items-center gap-2 transition-all", isScanning || (!currentPath && selectedPaths.size === 0) ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700" : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20")}>
                      {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 fill-current" />}
                      {isScanning ? '扫描中...' : (selectedPaths.size > 0 ? `匹配选中 (${selectedPaths.size})` : '扫描目录')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-slate-950/50">
                {loadingFiles ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin opacity-50" />
                    <span className="text-xs font-medium uppercase tracking-widest">正在加载目录...</span>
                  </div>
                ) : (
                  <div className={clsx(
                    viewMode === 'grid'
                      ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                      : "flex flex-col gap-1"
                  )}>
                    {fileList.length === 0 && isConfigured && !loadingFiles && (
                      <div className={clsx("col-span-full flex flex-col items-center justify-center text-slate-400 gap-3", viewMode === 'grid' ? "py-20" : "py-10")}>
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-2">
                          <Folder className="w-8 h-8 opacity-50" />
                        </div>
                        <span className="font-bold text-sm">空目录</span>
                        <span className="text-xs opacity-70">此位置没有文件</span>
                      </div>
                    )}

                    {fileList.map((file, i) => (
                      <div key={i}
                        onClick={() => { if (file.isDir) handleNavigate(file.path); else toggleSelection(file.path); }}
                        className={clsx(
                          "group relative rounded-xl border transition-all duration-200 cursor-pointer select-none",
                          viewMode === 'grid' ? "p-4 flex flex-col justify-between" : "px-4 py-2.5 flex items-center gap-3",
                          selectedPaths.has(file.path)
                            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500/50 shadow-sm ring-1 ring-blue-500/20"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md"
                        )}
                      >
                        <div className={clsx("flex items-center gap-2.5 min-w-0", viewMode === 'grid' ? "mb-2" : "flex-1")}>
                          {!file.isDir && (
                            <div
                              className={clsx(
                                "w-4 h-4 rounded border flex shrink-0 items-center justify-center transition-all",
                                selectedPaths.has(file.path)
                                  ? "bg-blue-500 border-blue-500"
                                  : "border-slate-300 dark:border-slate-600 hover:border-blue-400 bg-white dark:bg-slate-800"
                              )}
                              onClick={(e) => { e.stopPropagation(); toggleSelection(file.path); }}
                            >
                              {selectedPaths.has(file.path) && <Check className="w-3 h-3 text-white" />}
                            </div>
                          )}
                          {file.isDir && <div className="w-4 h-4 shrink-0" />} {/* Spacer for dirs without checkbox */}
                          <div className={clsx("truncate text-sm", file.isDir ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-700 dark:text-slate-200 font-medium")}>
                            {file.isDir ? `[目录] ${file.name}` : file.name}
                          </div>
                        </div>

                        {viewMode === 'list' && (
                          <div className="text-[10px] text-slate-400 w-24 text-right font-mono uppercase tracking-tighter">
                            {file.isDir ? 'FOLDER' : (file.size ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : '0 KB')}
                          </div>
                        )}
                        {viewMode === 'grid' && (
                          <div className="text-[10px] text-slate-400 text-right mt-1 font-mono uppercase tracking-tighter">
                            {file.isDir ? 'FOLDER' : (file.size ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : '0 KB')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={clsx("flex flex-col border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 transition-all duration-300", showLogs ? "h-48" : "h-9")}>
                <div
                  className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setShowLogs(!showLogs)}
                >
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <div className={clsx("w-2 h-2 rounded-full transition-colors", isScanning ? 'bg-amber-400 animate-pulse' : 'bg-slate-300')}>
                    </div>
                    活动日志
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); clearLogs(); }}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-red-500 transition-colors"
                      title="清空日志"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
                      {showLogs ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-2">
                  {logs.length === 0 && <div className="text-slate-400 italic opacity-50 flex items-center gap-2"><div className="w-1 h-1 bg-slate-400 rounded-full"></div> 系统就绪，等待任务...</div>}
                  {logs.map((log, i) => <LogItem key={i} log={log} />)}
                  <div id="log-end" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-8 py-4 border-b border-slate-200 dark:border-slate-800 space-x-6 flex bg-white dark:bg-slate-900 overflow-x-auto">
              <button onClick={() => setSettingsTab('general')} className={clsx("pb-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap", settingsTab === 'general' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400")}>常规设置</button>
              <button onClick={() => setSettingsTab('metadata')} className={clsx("pb-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap", settingsTab === 'metadata' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400")}>元数据源</button>
              <button onClick={() => setSettingsTab('llm')} className={clsx("pb-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap", settingsTab === 'llm' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400")}>LLM 模型</button>
              <button onClick={() => setSettingsTab('library')} className={clsx("pb-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap", settingsTab === 'library' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400")}>媒体库</button>
              <button onClick={() => setSettingsTab('rules')} className={clsx("pb-2 text-sm font-bold border-b-2 transition-all whitespace-nowrap", settingsTab === 'rules' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400")}>匹配规则</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl">

              {settingsTab === 'general' && (
                <>
                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Eye className="w-4 h-4" /> 外观与行为</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <span className="text-sm font-bold">主题模式</span>
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                          <button onClick={() => setTheme('light')} className={clsx("p-1.5 rounded-md transition-all", theme === 'light' ? "bg-white text-orange-500 shadow-sm" : "text-slate-400")}>
                            <Sun className="w-4 h-4" />
                          </button>
                          <button onClick={() => setTheme('dark')} className={clsx("p-1.5 rounded-md transition-all", theme === 'dark' ? "bg-slate-700 text-blue-400 shadow-sm" : "text-slate-400")}>
                            <Moon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
                        <span className="text-sm font-bold">日志级别</span>
                        <select value={logLevel} onChange={(e) => setLogLevel(e.target.value as any)} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs outline-none font-bold">
                          <option value="debug">Debug (调试)</option>
                          <option value="info">Info (信息)</option>
                          <option value="warn">Warning (警告)</option>
                          <option value="error">Error (错误)</option>
                        </select>
                      </div>
                    </div>
                  </section>
                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Network className="w-4 h-4" /> 网络代理</h3>
                    <div className="flex gap-2">
                      <input type="text" value={proxyInput} onChange={e => setProxyInput(e.target.value)} placeholder="http://127.0.0.1:7890" className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20" />
                      <TestButton onClick={handleTestProxy} loading={isTestingProxy} label="测试代理" />
                    </div>
                    <StatusMessage result={proxyTestResult} />
                  </section>
                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clapperboard className="w-4 h-4" /> 扫描设置</h3>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">视频扩展名</label>
                      <input type="text" value={videoExtsInput} onChange={e => setVideoExtsInput(e.target.value)} placeholder="mkv,mp4,avi,mov,iso,rmvb" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20" />
                      <p className="text-[10px] text-slate-500 italic">请使用逗号分隔多个扩展名。</p>
                    </div>
                  </section>
                </>
              )}

              {settingsTab === 'metadata' && (
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Globe className="w-4 h-4" /> TMDB 配置</h3>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg" className="w-10 h-10 object-contain" alt="TMDB" />
                        <div>
                          <div className="font-bold">The Movie Database</div>
                          <div className="text-xs text-slate-400">主要元数据提供商</div>
                        </div>
                      </div>
                      <TestButton onClick={handleTestTmdb} loading={isTestingTmdb} label="验证令牌" />
                    </div>
                    <div className="space-y-2 pt-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">API 读写令牌 (Read Access Token)</label>
                      <div className="relative">
                        <input type={showTmdbKey ? "text" : "password"} value={tmdbKey} onChange={e => setConfig('tmdbKey', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-4 pr-10 py-2 text-sm outline-none" placeholder="eyJ..." />
                        <button onClick={() => setShowTmdbKey(!showTmdbKey)} className="absolute right-3 top-2.5 text-slate-400">{showTmdbKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                      </div>
                    </div>
                    <StatusMessage result={tmdbTestResult} />
                  </div>
                </section>
              )}

              {settingsTab === 'llm' && (
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Play className="w-4 h-4" /> OpenAI 兼容服务</h3>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">接口地址 (Base URL)</label>
                        <input type="text" value={openaiBaseUrl} onChange={e => setConfig('openaiBaseUrl', e.target.value)} placeholder="https://api.openai.com/v1" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">模型名称 (Model)</label>
                        {availableModels.length > 0 ? (
                          <select value={openaiModel} onChange={e => setConfig('openaiModel', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none">{availableModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
                        ) : (
                          <input type="text" value={openaiModel} onChange={e => setConfig('openaiModel', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">API 密钥 (Key)</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input type={showOpenaiKey ? "text" : "password"} value={openaiKey} onChange={e => setConfig('openaiKey', e.target.value)} placeholder="sk-..." className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-4 pr-10 py-2 text-sm outline-none" />
                          <button onClick={() => setShowOpenaiKey(!showOpenaiKey)} className="absolute right-3 top-2.5 text-slate-400">{showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                        </div>
                        <TestButton onClick={handleTestLLM} loading={isTestingLLM} label="测试连接" />
                      </div>
                    </div>
                    <StatusMessage result={llmTestResult} />
                  </div>
                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 text-xs text-blue-600 dark:text-blue-400">
                    <strong>说明：</strong> 支持所有兼容 OpenAI 接口协议的服务（如 LocalAI, Ollama, DeepSeek 等）。
                  </div>
                </section>
              )}

              {settingsTab === 'library' && (
                <section className="space-y-6">
                  <div className="flex gap-4">
                    {['local', 'openlist'].map(type => (
                      <button key={type} onClick={() => setConfig('sourceType', type as any)} className={clsx("flex-1 p-4 rounded-xl border-2 text-left transition-all", sourceType === type ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/10" : "border-slate-200 dark:border-slate-800")}>
                        <div className="font-bold capitalize">{type}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{type === 'local' ? '扫描本地文件夹' : '同步 OpenList 服务器'}</div>
                      </button>
                    ))}
                  </div>
                  {sourceType === 'local' ? (
                    <div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">文件夹路径</label><div className="flex gap-2"><input type="text" value={localPathInput} onChange={e => setLocalPathInput(e.target.value)} className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none" /><button onClick={handleBrowseLocal} className="bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-slate-200 dark:border-slate-700"><Folder className="w-4 h-4" /> 浏览</button></div></div>
                  ) : (
                    <div className="space-y-4"><div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">服务器地址 (URL)</label><input type="text" value={openListUrlInput} onChange={e => setOpenListUrlInput(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none" /></div><div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">访问令牌 (Token)</label><div className="relative"><input type={showOpenListToken ? "text" : "password"} value={openListTokenInput} onChange={e => setOpenListTokenInput(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-4 pr-10 py-2 text-sm outline-none" /><button onClick={() => setShowOpenListToken(!showOpenListToken)} className="absolute right-3 top-2.5 text-slate-400">{showOpenListToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div><TestButton onClick={handleTestOpenList} loading={isTestingOpenList} label="测试连接" /><StatusMessage result={openListTestResult} /></div>
                  )}
                </section>
              )}
              {settingsTab === 'rules' && (
                <section className="space-y-4">
                  <div className="flex justify-between items-center"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Zap className="w-4 h-4" /> 正则表达式规则</h3><button onClick={handleAddRule} className="text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors">+ 添加规则</button></div>
                  <div className="space-y-2">
                    {(rules || []).map((rule, idx) => (
                      <div key={rule.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 group relative">
                        <div className="flex gap-4">
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">表达式 (Javascript Regex)</label>
                            <input type="text" value={rule.pattern} onChange={(e) => handleUpdateRule(idx, 'pattern', e.target.value)} placeholder="^(?<title>.+?)[. ]S(?<season>\d+)E(?<episode>\d+).*" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 ring-blue-500" />
                          </div>
                          <div className="w-24 space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">类型</label>
                            <select value={rule.type} onChange={(e) => handleUpdateRule(idx, 'type', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1.5 text-xs outline-none">
                              <option value="tv">TV (剧集)</option>
                              <option value="movie">Movie (电影)</option>
                              <option value="anime">Anime (动漫)</option>
                            </select>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteRule(idx)} className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
              <div className="text-[10px] text-slate-400 font-medium">
                OpenList Scraper &bull; {appVersion ? `版本 ${appVersion}` : '...'} &bull; © 2025 Landon Li
              </div>
              <button onClick={handleSaveConfig} disabled={saveStatus === 'saving'} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all">{saveStatus === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saveStatus === 'saved' ? '设置已保存！' : '保存设置'}</button>
            </div>
          </div>
        )}
      </main>

      {/* Wizard Modal */}
      {wizardStage !== 'idle' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <div className={clsx("bg-white dark:bg-slate-900 w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 transition-all", wizardStage === 'series' ? "max-w-2xl" : "max-w-5xl")}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div><h2 className="text-xl font-bold">{wizardStage === 'series' && "请选择正确的剧集"}{wizardStage === 'loading_episodes' && "正在获取元数据"}{wizardStage === 'episodes' && "审查与执行操作"}{wizardStage === 'executing' && "正在执行操作"}{wizardStage === 'finished' && "任务已完成"}</h2><p className="text-sm text-slate-500 mt-1">{wizardStage === 'series' && <span>检测到： <span className="text-blue-500 font-bold">{wizardData.detectedName}</span></span>}{wizardStage === 'episodes' && <span>剧集： <span className="text-blue-500 font-bold">{wizardData.seriesName}</span> • <span className="font-bold">{selectedIndices.length}</span> 个项目</span>}</p></div>
              {(wizardStage === 'series' || wizardStage === 'episodes' || wizardStage === 'finished') && <button onClick={closeWizard} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>}
            </div>
            {wizardStage === 'series' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mb-4">
                  <label className="text-xs font-bold text-blue-500 uppercase tracking-widest block mb-2">识别结果不准确？手动搜索：</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualSeriesName}
                      onChange={e => setManualSeriesName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                      placeholder="输入剧集名称..."
                      className="flex-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500"
                    />
                    <button onClick={handleManualSearch} disabled={!manualSeriesName || wizardData.seriesResults?.length === 0} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      重试
                    </button>
                  </div>
                </div>
                {wizardData.seriesResults === undefined && (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3 text-slate-400">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500 opacity-50" />
                    <span className="text-xs font-medium uppercase tracking-widest">正在搜索 "{manualSeriesName}"...</span>
                  </div>
                )}
                {wizardData.seriesResults !== undefined && wizardData.seriesResults.length === 0 && <div className="text-center py-10 text-slate-400">未找到相关结果，请尝试其他关键词。</div>}

                {wizardData.seriesResults && wizardData.seriesResults.map((item: any) => (
                  <div key={item.id} onClick={() => handleConfirmSeries(item.id)} className="flex gap-4 p-3 rounded-xl border hover:border-blue-500 cursor-pointer transition-all">
                    {item.poster ? <img src={item.poster} className="w-20 h-28 object-cover rounded-md" alt="" /> : <div className="w-20 h-28 bg-slate-100 rounded-md flex items-center justify-center"><File className="w-8 h-8 text-slate-400" /></div>}
                    <div className="flex-1 min-w-0"><h4 className="font-bold text-lg truncate">{item.title} ({item.year || 'N/A'})</h4><p className="text-xs text-slate-500 line-clamp-3 mt-1">{item.overview}</p></div>
                  </div>
                ))}
                {wizardData.seriesResults && <button onClick={() => handleConfirmSeries(null)} className="w-full p-4 border-2 border-dashed rounded-xl text-sm font-bold text-slate-400">跳过并使用原文件名</button>}
              </div>
            )}
            {wizardStage === 'loading_episodes' && <div className="flex-1 py-20 flex flex-col items-center justify-center space-y-4"><RefreshCw className="w-10 h-10 text-blue-500 animate-spin" /><p className="font-bold">正在获取详细信息...</p></div>}
            {wizardStage === 'episodes' && (
              <>
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                  <div className="flex flex-wrap gap-4">
                    {[{ id: 'rename', label: '重命名' }, { id: 'writeNfo', label: '生成 NFO' }, { id: 'writePoster', label: '下载海报' }, { id: 'writeStill', label: '下载剧照' }].map(opt => (
                      <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={(batchOptions as any)[opt.id]} onChange={() => toggleOption(opt.id as any)} className="w-4 h-4 rounded text-blue-600" />
                        <span className="text-xs font-bold">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[60vh]">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase"><tr><th className="px-6 py-3 w-12"><input type="checkbox" checked={selectedIndices.length === wizardData.matches?.length} onChange={toggleSelectIndicesAll} /></th><th>预览</th><th className="w-24">识别结果</th><th>元数据</th></tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {wizardData.matches?.map((item: any, idx: number) => {
                        const fileExt = item.file.name.substring(item.file.name.lastIndexOf('.'));
                        const newName = item.metadata ? `${wizardData.seriesName} - S${String(item.match.season ?? 1).padStart(2, '0')}E${String(item.match.episode ?? 1).padStart(2, '0')} - ${item.metadata.title}${fileExt}` : '';
                        return (
                          <tr key={idx} className={clsx(!selectedIndices.includes(idx) && "opacity-50")}>
                            <td className="px-6 py-4"><input type="checkbox" checked={selectedIndices.includes(idx)} onChange={() => toggleIndex(idx)} /></td>
                            <td className="px-6 py-4 text-[11px]">
                              <div className="text-slate-400 truncate">{item.file.name}</div>
                              {batchOptions.rename && newName && newName !== item.file.name && (<div className="text-green-600 font-bold truncate">→ {newName}</div>)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => { setEditingMatchIndex(idx); setEditMatchValues({ season: item.match.season ?? 1, episode: item.match.episode ?? 1 }); }}
                                className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
                              >
                                S{String(item.match.season ?? 1).padStart(2, '0')}E{String(item.match.episode ?? 1).padStart(2, '0')}
                              </button>
                            </td>
                            <td className="px-6 py-4 cursor-pointer" onClick={() => handleShowEpisodeDetail(item)}>{item.metadata ? <div className="flex items-center gap-2">{item.metadata.stillPath && <img src={item.metadata.stillPath} className="w-10 h-6 object-cover rounded" alt="" />}<div className="text-xs font-bold text-blue-600 truncate">{item.metadata.title}</div></div> : <span className="text-[10px] text-red-400">无元数据</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="p-6 border-t border-slate-200 flex justify-end gap-3"><button onClick={() => handleConfirmEpisodes(false)} className="px-4 py-2 text-sm font-bold text-slate-500">取消</button><button onClick={() => handleConfirmEpisodes(true)} disabled={selectedIndices.length === 0} className="px-8 py-2 bg-blue-600 text-white rounded-lg font-bold">执行</button></div>
              </>
            )}
            {(wizardStage === 'executing' || wizardStage === 'finished') && (
              <div className="p-12 flex flex-col items-center justify-center space-y-8">
                <div className="w-full max-w-md space-y-4"><div className="flex justify-between text-sm font-bold"><span>{scrapeProgress.message}</span><span>{scrapeProgress.percent}%</span></div><div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${scrapeProgress.percent}%` }}></div></div></div>
                {wizardStage === 'finished' && <button onClick={closeWizard} className="px-10 py-2.5 bg-slate-900 text-white rounded-xl font-bold">关闭向导</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Match Modal */}
      {editingMatchIndex !== null && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold">手动修正</h3>
              <button onClick={() => setEditingMatchIndex(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">季 (Season)</label>
                  <input
                    type="number"
                    min="0"
                    value={editMatchValues.season}
                    onChange={e => setEditMatchValues({ ...editMatchValues, season: parseInt(e.target.value) ?? 0 })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 ring-blue-500/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">集 (Episode)</label>
                  <input
                    type="number"
                    min="1"
                    value={editMatchValues.episode}
                    onChange={e => setEditMatchValues({ ...editMatchValues, episode: parseInt(e.target.value) ?? 1 })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 ring-blue-500/20 transition-all"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">调整这些值将为该文件重新获取元数据。</p>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setEditingMatchIndex(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">取消</button>
                <button onClick={handleManualMatchUpdate} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/30 transition-all">确认</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEpisodeDetail && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl">
            {selectedEpisodeDetail.stillPath && <div className="relative h-64"><img src={selectedEpisodeDetail.stillPath} className="w-full h-full object-cover" alt="" /></div>}
            <div className="p-8">
              <h3 className="text-2xl font-black">{selectedEpisodeDetail.title} (S{selectedEpisodeDetail.season}E{selectedEpisodeDetail.episode})</h3>

              <div className="flex items-center gap-6 mt-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                {selectedEpisodeDetail.airDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    {selectedEpisodeDetail.airDate}
                  </div>
                )}
                {selectedEpisodeDetail.runtime !== undefined && selectedEpisodeDetail.runtime !== null && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    {selectedEpisodeDetail.runtime} 分钟
                  </div>
                )}
              </div>

              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{selectedEpisodeDetail.overview || "暂无简介。"}</p>
              <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end"><button onClick={() => setSelectedEpisodeDetail(null)} className="px-6 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-xs">关闭</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}