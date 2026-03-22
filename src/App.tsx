import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppStore, LogType, ScrapedMediaRecord } from './stores/appStore';
import { Settings, Database, Globe, Play, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, Save, ArrowRight, Minus, Square, X, Folder, Network, Zap, File, Clapperboard, ChevronUp, ChevronDown, LayoutGrid, List, Wand2, Sun, Moon, ArrowLeft, CornerLeftUp, Check, Calendar, Clock, Trash2, Download, Sparkles, Copy, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import type {
  ScannerRequireConfirmationPayload,
} from '../shared/ipc';
import type {
  BatchOptions,
  EpisodeConfirmationPayload,
  EpisodeDetailState,
  EpisodeMatchItem,
  FileItem,
  LogLevel,
  MediaSearchMode,
  MetadataProgressPayload,
  RuleDefinition,
  ScannerLogPayload,
  ScannerOperationProgressPayload,
  SearchResult,
  ThemeMode,
  UpdateDownloadedPayload,
  UpdateDownloadProgressPayload,
  ViewMode,
} from '../shared/types';

type StatusResult = { success: boolean; message: string };

type UpdateInfoState = {
  currentVersion: string;
  latestVersion: string;
  releaseNote: string;
};

type WizardState = {
  detectedName?: string;
  seriesResults?: SearchResult[];
  searchMode?: MediaSearchMode;
  notice?: string;
  seriesName?: string;
  seriesId?: string;
  matches?: EpisodeMatchItem[];
};

const dragRegionStyle: CSSProperties & { WebkitAppRegion: 'drag' } = { WebkitAppRegion: 'drag' };
const noDragRegionStyle: CSSProperties & { WebkitAppRegion: 'no-drag' } = { WebkitAppRegion: 'no-drag' };
const defaultBatchOptions: BatchOptions = { rename: true, writeNfo: true, writePoster: true, writeStill: true };
const batchOptionDefinitions: Array<{ id: keyof BatchOptions; label: string }> = [
  { id: 'rename', label: '重命名' },
  { id: 'writeNfo', label: '生成 NFO' },
  { id: 'writePoster', label: '下载海报' },
  { id: 'writeStill', label: '下载剧照' },
];
const searchModeOptions: Array<{ value: MediaSearchMode; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'tv', label: '电视剧' },
  { value: 'movie', label: '电影' },
];

const StatusMessage = ({ result }: { result: StatusResult | null }) => {
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

const parseScrapedAt = (value?: string) => {
  if (!value) return null;

  // SQLite CURRENT_TIMESTAMP is stored as UTC without an offset suffix.
  const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z'
    : value;

  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatScrapedAt = (value?: string) => {
  if (!value) return '未知时间';
  const date = parseScrapedAt(value);
  if (!date) return value;
  return date.toLocaleString();
};

const formatRelativeScrapedAt = (value?: string) => {
  if (!value) return '等待记录';
  const date = parseScrapedAt(value);
  if (!date) return '时间未知';

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, 'day');
};

const basename = (input: string) => {
  const normalized = input.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || input;
};

const isAbsoluteLocalPath = (value: string) => /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');

const resolveHistoryPath = (rawPath: string, sourceType: 'local' | 'openlist', localRootPath: string) => {
  if (sourceType === 'openlist') {
    const normalized = rawPath.replace(/\\/g, '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  if (isAbsoluteLocalPath(rawPath)) return rawPath;
  if (!localRootPath) return rawPath;

  const normalizedRoot = localRootPath.replace(/[\\/]+$/, '');
  const normalizedRelative = rawPath.replace(/^[/\\]+/, '');
  return `${normalizedRoot}\\${normalizedRelative.replace(/[\\/]+/g, '\\')}`;
};

const getHistoryParentPath = (targetPath: string, sourceType: 'local' | 'openlist') => {
  if (sourceType === 'openlist') {
    const normalized = targetPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized || normalized === '/') return '/';
    const index = normalized.lastIndexOf('/');
    if (index <= 0) return '/';
    return normalized.slice(0, index);
  }

  const normalized = targetPath.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  if (index < 0) return normalized;
  const parent = normalized.slice(0, index);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent;
};

const formatFileSize = (size?: number) => {
  if (!size || size <= 0) return '--';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const formatExplorerMtime = (value?: string | number | Date) => {
  if (!value) return '--';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
};

const getFileExtension = (name: string) => {
  const ext = name.split('.').pop();
  if (!ext || ext === name) return 'FILE';
  return ext.toUpperCase();
};

const getThumbSidecarName = (fileName: string) => {
  const index = fileName.lastIndexOf('.');
  const base = index > 0 ? fileName.slice(0, index) : fileName;
  return `${base}-thumb.jpg`;
};

const getErrorMessage = (error: unknown, fallback = '未知错误') => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
};

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

const MediaHistoryItem = ({
  item,
  onNavigate,
  isNavigating,
}: {
  item: ScrapedMediaRecord;
  onNavigate: (item: ScrapedMediaRecord) => void;
  isNavigating: boolean;
}) => {
  const isMovie = (item.season ?? 0) === 0 && (item.episode ?? 0) === 0;
  const imageUrl = isMovie ? (item.poster || item.still) : (item.still || item.poster);
  const episodeCode = isMovie
    ? 'Movie'
    : `S${String(item.season ?? 0).padStart(2, '0')}E${String(item.episode ?? 0).padStart(2, '0')}`;
  const tmdbUrl = item.tmdb_id
    ? (
        isMovie
          ? `https://www.themoviedb.org/movie/${item.tmdb_id}`
          : (
              item.season && item.episode
                ? `https://www.themoviedb.org/tv/${item.tmdb_id}/season/${item.season}/episode/${item.episode}`
                : `https://www.themoviedb.org/tv/${item.tmdb_id}`
            )
      )
    : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => !isNavigating && onNavigate(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!isNavigating) onNavigate(item);
        }
      }}
      className={clsx(
        "group rounded-2xl border bg-white/90 dark:bg-slate-900/80 shadow-sm overflow-hidden transition-all",
        isNavigating
          ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-300/50 dark:ring-blue-700/50"
          : "border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-md cursor-pointer"
      )}
    >
      <div className="flex gap-3 p-3">
        <div className={clsx(
          "shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center",
          isMovie ? "w-16 h-24" : "w-24 h-16"
        )}>
          {imageUrl ? (
            <img src={imageUrl} alt={item.episode_title || item.series_name || 'Scraped media'} className="w-full h-full object-cover" />
          ) : (
            <Clapperboard className="w-5 h-5 text-slate-400" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">{episodeCode}</p>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{item.series_name || '未命名剧集'}</h3>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigator.clipboard.writeText(item.file_path);
                }}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all flex items-center justify-center"
                title="复制路径"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {tmdbUrl && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void window.ipcRenderer.invoke('system:openExternal', tmdbUrl);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all flex items-center justify-center"
                  title="打开 TMDB 页面"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2 py-1 text-[10px] font-bold">
                已刮削
              </span>
            </div>
          </div>

          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
            {item.episode_title || '未获取剧集标题'}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <span>{formatRelativeScrapedAt(item.scraped_at)}</span>
            {item.runtime ? <span>{item.runtime} min</span> : null}
            {item.air_date ? <span>{item.air_date}</span> : null}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">文件路径</div>
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 truncate">{basename(item.file_path)}</div>
        <div className="mt-0.5 text-[11px] text-slate-400 truncate">{item.file_path}</div>
      </div>
    </article>
  );
};

const UtilityDrawer = ({
  title,
  subtitle,
  onClose,
  widthClassName,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  widthClassName?: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <>
    <button
      type="button"
      aria-label="关闭侧边面板"
      onClick={onClose}
      className="fixed inset-0 top-8 z-[130] bg-slate-950/30 backdrop-blur-[1px]"
    />
    <aside className={clsx("fixed top-8 right-0 bottom-0 z-[140] max-w-[92vw] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl flex flex-col", widthClassName ?? "w-[420px]")}>
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</div>
          <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{subtitle}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </aside>
  </>
);

export default function App() {
  const {
    tmdbKey, openaiKey, openaiBaseUrl, openaiModel,
    sourceType, localPath, openListUrl, openListToken,
    logs, isScanning, media,
    setConfig, setVideoExtensions, addLog, clearLogs, setScanning, setMedia
  } = useAppStore();

  // Navigation & UI Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [settingsTab, setSettingsTab] = useState<'general' | 'metadata' | 'llm' | 'library' | 'rules'>('general');

  // Explorer
  const [currentPath, setCurrentPath] = useState('');
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [navHistory, setNavHistory] = useState<string[]>([]);
  const [thumbnailByPath, setThumbnailByPath] = useState<Record<string, string>>({});
  const [failedThumbnailPaths, setFailedThumbnailPaths] = useState<Set<string>>(new Set());

  // Selection State (Multi-select)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Settings inputs
  const [showTmdbKey, setShowTmdbKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showOpenListToken, setShowOpenListToken] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [rules, setRules] = useState<RuleDefinition[]>([]);

  const [isTestingLLM, setIsTestingLLM] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<StatusResult | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isTestingTmdb, setIsTestingTmdb] = useState(false);
  const [tmdbTestResult, setTmdbTestResult] = useState<StatusResult | null>(null);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<StatusResult | null>(null);
  const [isTestingOpenList, setIsTestingOpenList] = useState(false);
  const [openListTestResult, setOpenListTestResult] = useState<StatusResult | null>(null);

  // Wizard
  const [wizardStage, setWizardWizardStage] = useState<'idle' | 'series' | 'loading_episodes' | 'episodes' | 'executing' | 'finished'>('idle');
  const [wizardData, setWizardData] = useState<WizardState>({});
  const [scrapeProgress, setScrapeProgress] = useState<{ percent: number, message: string }>({ percent: 0, message: '' });
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [batchOptions, setBatchOptions] = useState<BatchOptions>(defaultBatchOptions);

  const [selectedEpisodeDetail, setSelectedEpisodeDetail] = useState<EpisodeDetailState | null>(null);
  const [, setLoadingDetail] = useState(false);
  const [editingMatchIndex, setEditingMatchIndex] = useState<number | null>(null);
  const [editMatchValues, setEditMatchValues] = useState({ season: 1, episode: 1 });
  const [manualSeriesName, setManualSeriesName] = useState('');

  // Batch edit states
  const [batchEditMode, setBatchEditMode] = useState<'season' | 'episode' | null>(null);
  const [batchSeasonValue, setBatchSeasonValue] = useState(1);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [anchorEpisode, setAnchorEpisode] = useState(1);

  // Metadata fetch states
  const [metadataFetched, setMetadataFetched] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [metadataProgress, setMetadataProgress] = useState({ current: 0, total: 0 });

  // Smart identify states
  const [smartIdentifying, setSmartIdentifying] = useState(false);

  // Local input mirror
  const [proxyInput, setProxyInput] = useState('');
  const [localPathInput, setLocalPathInput] = useState('');
  const [openListUrlInput, setOpenListUrlInput] = useState('');
  const [openListTokenInput, setOpenListTokenInput] = useState('');
  const [openListBatchSizeInput, setOpenListBatchSizeInput] = useState('20');
  const [videoExtsInput, setVideoExtsInput] = useState('');

  // General Settings
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [logLevel, setLogLevel] = useState<LogLevel>('info');

  // UI State
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<'history' | 'logs' | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Update State
  const [appVersion, setAppVersion] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfoState | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);
  const [navigatingHistoryPath, setNavigatingHistoryPath] = useState<string | null>(null);
  const updateCheckInFlightRef = useRef(false);

  const refreshMedia = useCallback(async (options?: { silent?: boolean }) => {
    setIsRefreshingHistory(true);
    try {
      const allMedia = await window.ipcRenderer.invoke('media:getAll');
      setMedia(Array.isArray(allMedia) ? allMedia : []);
    } catch (error) {
      if (!options?.silent) {
        addLog(`刷新历史记录失败: ${getErrorMessage(error)}`, 'error');
      }
    } finally {
      setIsRefreshingHistory(false);
    }
  }, [addLog, setMedia]);

  // Initial Configuration Loading
  useEffect(() => {
    if (!window.ipcRenderer) return;

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
        const oBatchSize = await window.ipcRenderer.invoke('config:get', 'openlist_batch_size');
        if (oBatchSize) setOpenListBatchSizeInput(oBatchSize);
        else setOpenListBatchSizeInput('20');
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

    const handleLog = (data: ScannerLogPayload) => addLog(data.message, data.type);
    const handleFinished = () => {
      setScanning(false);
      addLog('扫描任务全部完成。', 'success');
      refreshMedia();
    };
    const handleConfirmation = (data: ScannerRequireConfirmationPayload) => {
      setMetadataFetched(false);
      setFetchingMetadata(false);
      setMetadataProgress({ current: 0, total: 0 });
      setWizardData({
        detectedName: data.detectedName,
        seriesResults: data.results,
        searchMode: data.searchMode,
        notice: data.notice,
      });
      setManualSeriesName(data.detectedName); // Initialize with detected name
      setWizardWizardStage('series');
    };
    const handleEpisodesConfirmation = (data: EpisodeConfirmationPayload) => {
      setMetadataFetched(false);
      setFetchingMetadata(false);
      setMetadataProgress({ current: 0, total: 0 });
      setWizardData(prev => ({
        ...prev,
        seriesName: data.seriesName,
        seriesId: data.matches[0]?.tmdbId,
        matches: data.matches
      }));
      setSelectedIndices(data.matches.map((_, i) => i));
      setWizardWizardStage('episodes');
    };
    const handleProgress = (data: ScannerOperationProgressPayload) => {
      setScrapeProgress({ percent: data.percent, message: data.message });
      if (data.finished) setWizardWizardStage('finished');
    };

    const handleDownloadProgress = (data: UpdateDownloadProgressPayload) => {
      setDownloadProgress(Number(data.percent));
    };

    const handleUpdateDownloaded = (data: UpdateDownloadedPayload) => {
      setIsDownloadingUpdate(false);
      setIsUpdateReady(true);
      setDownloadProgress(100);
      setShowUpdateDialog(true);
      setUpdateInfo((prev) => {
        if (prev) {
          return {
            ...prev,
            latestVersion: data?.version || prev.latestVersion,
            releaseNote: data?.releaseNote || prev.releaseNote,
          };
        }

        return {
          currentVersion: '',
          latestVersion: data?.version || '',
          releaseNote: data?.releaseNote || '暂无发布说明',
        };
      });
      addLog('更新下载完成，准备在重启后安装。', 'success');
    };

    const cleanupLog = window.ipcRenderer.on('scanner-log', handleLog);
    const cleanupFinished = window.ipcRenderer.on('scanner-finished', handleFinished);
    const cleanupConf = window.ipcRenderer.on('scanner-require-confirmation', handleConfirmation);
    const cleanupEpConf = window.ipcRenderer.on('scanner-require-episodes-confirmation', handleEpisodesConfirmation);
    const cleanupProgress = window.ipcRenderer.on('scanner-operation-progress', handleProgress);
    const cleanupDlProgress = window.ipcRenderer.on('update:download-progress', handleDownloadProgress);
    const cleanupDownloaded = window.ipcRenderer.on('update:downloaded', handleUpdateDownloaded);

    loadConfig();
    return () => {
      [cleanupLog, cleanupFinished, cleanupConf, cleanupEpConf, cleanupProgress, cleanupDlProgress, cleanupDownloaded]
        .forEach((cleanup) => cleanup());
    };
  }, [addLog, refreshMedia, setConfig, setScanning, setVideoExtensions]);

  // 监听元数据获取进度
  useEffect(() => {
    if (!window.ipcRenderer) return;

    const handleProgress = (progress: MetadataProgressPayload) => {
      console.log('[前端] 收到进度更新:', progress);
      setMetadataProgress(progress);
    };

    const cleanup = window.ipcRenderer.on('metadata-progress', handleProgress);

    return () => {
      if (cleanup && typeof cleanup === 'function') {
        (cleanup as () => void)();
      }
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
  const handleConfirmSeries = (selected: SearchResult | null) => {
    window.ipcRenderer.send('scanner-confirm-response', {
      seriesId: selected?.id ?? null,
      seriesName: selected?.title, // 添加用户确认的剧集名称
      mediaType: selected?.mediaType,
      searchMode: wizardData.searchMode ?? 'auto',
    });

    if (!selected?.id) {
      setWizardWizardStage('idle');
      setWizardData({});
    } else {
      setWizardWizardStage('loading_episodes');
    }
  };

  const handleManualSearch = () => {
    if (!manualSeriesName.trim()) return;

    // Send IPC request with new name
    window.ipcRenderer.send('scanner-confirm-response', {
      seriesId: null,
      newName: manualSeriesName,
      searchMode: wizardData.searchMode ?? 'auto',
    });

    // Set to undefined to indicate loading state (distinct from empty array which means no results)
    setWizardData(prev => ({ ...prev, seriesResults: undefined, notice: undefined }));
  };

  const handleSearchModeChange = (mode: MediaSearchMode) => {
    if ((wizardData.searchMode ?? 'auto') === mode) return;
    setWizardData(prev => ({ ...prev, searchMode: mode, seriesResults: undefined, notice: undefined }));
    window.ipcRenderer.send('scanner-confirm-response', {
      seriesId: null,
      searchMode: mode,
    });
  };

  const handleConfirmEpisodes = (confirmed: boolean) => {
    if (!confirmed) {
      window.ipcRenderer.send('scanner-episodes-confirm-response', { confirmed: false, selectedIndices: [] });
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
      window.ipcRenderer.send('scanner-episodes-confirm-response', { confirmed: false, selectedIndices: [] });
    }

    setWizardWizardStage('idle');
    setWizardData({});
    setScrapeProgress({ percent: 0, message: '' });
    setMetadataFetched(false);
    setFetchingMetadata(false);
    setMetadataProgress({ current: 0, total: 0 });

    if (wizardStage === 'finished') {
      setScanning(false);
    }
  };

  const handleCancelCurrentTask = async () => {
    try {
      await window.ipcRenderer.invoke('scanner:cancel');
      addLog('已请求停止当前任务。', 'warn');
    } catch (error) {
      addLog(`停止任务失败: ${getErrorMessage(error)}`, 'error');
    } finally {
      setWizardWizardStage('idle');
      setWizardData({});
      setScrapeProgress({ percent: 0, message: '' });
      setMetadataFetched(false);
      setFetchingMetadata(false);
      setMetadataProgress({ current: 0, total: 0 });
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
      const showId = item.tmdbId;
      if (!showId) return;
      const metadata = await window.ipcRenderer.invoke('metadata:getEpisodeDetail', {
        showId,
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
    } catch (error) {
      console.error('Failed to fetch metadata for manual match:', error);
    }
  };

  const handleBatchSeasonUpdate = async () => {
    if (!wizardData.matches) return;

    const newMatches = [...wizardData.matches];

    for (const idx of selectedIndices) {
      newMatches[idx] = {
        ...newMatches[idx],
        match: { ...newMatches[idx].match, season: batchSeasonValue }
      };
    }

    setWizardData(prev => ({ ...prev, matches: newMatches }));
    setBatchEditMode(null);
  };

  const handleBatchEpisodeUpdate = async () => {
    if (anchorIndex === null || !wizardData.matches) return;

    // 获取锚点的原始集数
    const anchorOriginalEpisode = wizardData.matches[anchorIndex].match.originalEpisode;

    // 如果锚点没有原始集数，回退到基于位置的计算
    if (!anchorOriginalEpisode) {
      const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
      const anchorPositionInSelection = sortedIndices.indexOf(anchorIndex);
      if (anchorPositionInSelection === -1) return;

      const newMatches = [...wizardData.matches];
      for (let i = 0; i < sortedIndices.length; i++) {
        const idx = sortedIndices[i];
        const offset = i - anchorPositionInSelection;
        const newEpisode = anchorEpisode + offset;
        newMatches[idx] = {
          ...newMatches[idx],
          match: { ...newMatches[idx].match, episode: newEpisode }
        };
      }
      setWizardData(prev => ({ ...prev, matches: newMatches }));
      setBatchEditMode(null);
      setAnchorIndex(null);

      // 使用更新后的数据获取元数据
      setTimeout(() => {
        handleFetchMetadataWithData(newMatches, wizardData.seriesId!);
      }, 100);
      return;
    }

    // 基于原始集数计算偏移
    const newMatches = [...wizardData.matches];

    for (const idx of selectedIndices) {
      const item = wizardData.matches[idx];
      const itemOriginalEpisode = item.match.originalEpisode;

      // 如果该文件没有原始集数，跳过
      if (!itemOriginalEpisode) continue;

      // 计算该文件相对于锚点的偏移
      const offset = itemOriginalEpisode - anchorOriginalEpisode;
      const newEpisode = anchorEpisode + offset;

      newMatches[idx] = {
        ...newMatches[idx],
        match: { ...newMatches[idx].match, episode: newEpisode }
      };
    }

    setWizardData(prev => ({ ...prev, matches: newMatches }));
    setBatchEditMode(null);
    setAnchorIndex(null);

    // 自动获取元数据
    setTimeout(() => handleFetchMetadataWithData(newMatches, wizardData.seriesId!), 100);
  };

  const handleFetchMetadataWithData = async (matches: EpisodeMatchItem[], seriesId: string) => {
    if (!matches || !seriesId || fetchingMetadata) return;

    setFetchingMetadata(true);
    setMetadataProgress({ current: 0, total: matches.length });

    try {
      const result = await window.ipcRenderer.invoke('scanner:fetch-metadata', {
        matches,
        seriesId
      });

      if (result.success) {
        setWizardData(prev => ({ ...prev, matches: result.matches }));
        setMetadataFetched(true);
      } else {
        console.error('Failed to fetch metadata:', result.error);
      }
    } catch (e) {
      console.error('Error fetching metadata:', e);
    } finally {
      setFetchingMetadata(false);
      setMetadataProgress({ current: 0, total: 0 });
    }
  };

  const handleFetchMetadata = async () => {
    if (!wizardData.matches || !wizardData.seriesId || fetchingMetadata) return;

    setFetchingMetadata(true);

    try {
      const result = await window.ipcRenderer.invoke('scanner:fetch-metadata', {
        matches: wizardData.matches,
        seriesId: wizardData.seriesId
      });

      if (result.success) {
        setWizardData(prev => ({ ...prev, matches: result.matches }));
        setMetadataFetched(true);
      } else {
        console.error('Failed to fetch metadata:', result.error);
      }
    } catch (e) {
      console.error('Error fetching metadata:', e);
    } finally {
      setFetchingMetadata(false);
    }
  };

  const handleSmartIdentify = async () => {
    if (!wizardData.matches || smartIdentifying) return;
    const unmatched = wizardData.matches.filter((item) => !item.match.success || item.match.source === 'unmatched');
    if (unmatched.length === 0) return;
    setSmartIdentifying(true);
    try {
      const result = await window.ipcRenderer.invoke('scanner:smart-identify', { unmatchedFiles: unmatched });
      if (result.success) {
        const newMatches = wizardData.matches.map((item) => {
          const smartResult = result.results.find((matchedItem) => matchedItem.file.path === item.file.path);
          return smartResult || item;
        });
        setWizardData(prev => ({ ...prev, matches: newMatches }));
      }
    } catch (e) {
      console.error('Smart identify error:', e);
    } finally {
      setSmartIdentifying(false);
    }
  };

  const handleNavigate = (path: string) => {
    loadDirectory(path);
  };

  const isWithinLocalRoot = (targetPath: string, rootPath: string) => {
    if (!targetPath || !rootPath) return false;

    const normalizedRoot = rootPath.replace(/[\\/]+$/, '');
    const normalizedTarget = targetPath.replace(/[\\/]+$/, '');
    const lowerRoot = normalizedRoot.toLowerCase();
    const lowerTarget = normalizedTarget.toLowerCase();

    return lowerTarget === lowerRoot || lowerTarget.startsWith(`${lowerRoot}\\`) || lowerTarget.startsWith(`${lowerRoot}/`);
  };

  const isValidOpenListPath = (targetPath: string) => {
    if (!targetPath) return true;

    return (
      (targetPath === '/' || targetPath.startsWith('/')) &&
      !targetPath.includes('\\') &&
      !/^\/?[A-Za-z]:/.test(targetPath)
    );
  };

  const getLocalBreadcrumbParts = (targetPath: string, rootPath: string) => {
    if (!isWithinLocalRoot(targetPath, rootPath)) return [];

    const normalizedRoot = rootPath.replace(/[\\/]+$/, '');
    const normalizedTarget = targetPath.replace(/[\\/]+$/, '');
    const relativePath = normalizedTarget.slice(normalizedRoot.length).replace(/^[/\\]+/, '');

    return relativePath ? relativePath.split(/[\\/]/).filter(Boolean) : [];
  };

  const loadDirectoryForSource = useCallback(async (
    targetSourceType: 'local' | 'openlist',
    path: string,
    options?: { isBack?: boolean; silentError?: boolean },
  ) => {
    setLoadingFiles(true);
    setFileList([]);
    setSelectedPaths(new Set());
    setLastClickedIndex(null);
    setThumbnailByPath({});
    setFailedThumbnailPaths(new Set());

    if (!options?.isBack && currentPath && targetSourceType === sourceType) {
      setNavHistory(prev => [...prev, currentPath]);
    }

    const result = await window.ipcRenderer.invoke('explorer:list', {
      type: targetSourceType,
      path,
      config: { localPath, openListUrl, openListToken },
    });

    if (result.success) {
      setFileList(result.data);
      setCurrentPath(result.currentPath);
    } else if (!options?.silentError) {
      addLog(`无法加载目录: ${result.error}`, 'error');
    }

    setLoadingFiles(false);
    return result;
  }, [addLog, currentPath, localPath, openListToken, openListUrl, sourceType]);

  const loadDirectory = useCallback(async (path: string, options?: { isBack?: boolean; silentError?: boolean }) => {
    return loadDirectoryForSource(sourceType, path, options);
  }, [loadDirectoryForSource, sourceType]);

  const handleSourceTypeChange = useCallback((nextType: 'local' | 'openlist') => {
    if (nextType === sourceType) return;

    setConfig('sourceType', nextType);
    setCurrentPath('');
    setNavHistory([]);
    setFileList([]);
    setSelectedPaths(new Set());
    setLastClickedIndex(null);
  }, [setConfig, sourceType]);

  const handleOpenHistoryItem = useCallback(async (item: ScrapedMediaRecord) => {
    const inferredSourceType = item.source_type === 'local' || item.source_type === 'openlist'
      ? item.source_type
      : (item.file_path.startsWith('/') ? 'openlist' : 'local');

    if (inferredSourceType === 'local' && !localPath) {
      addLog('无法从历史记录定位：本地路径未配置。', 'warn');
      return;
    }
    if (inferredSourceType === 'openlist' && !openListUrl) {
      addLog('无法从历史记录定位：OpenList 未配置。', 'warn');
      return;
    }

    const resolvedPath = resolveHistoryPath(item.file_path, inferredSourceType, localPath);
    setNavigatingHistoryPath(item.file_path);

    try {
      if (sourceType !== inferredSourceType) {
        handleSourceTypeChange(inferredSourceType);
      }

      const tryDirectory = await loadDirectoryForSource(inferredSourceType, resolvedPath, { silentError: true });
      if (tryDirectory.success) {
        setActiveUtilityPanel(null);
        addLog(`已从历史记录打开目录: ${resolvedPath}`, 'info');
        return;
      }

      const parentPath = getHistoryParentPath(resolvedPath, inferredSourceType);
      const tryParent = await loadDirectoryForSource(inferredSourceType, parentPath, { silentError: true });
      if (!tryParent.success) {
        addLog(`历史记录目标不可访问: ${item.file_path}`, 'warn');
        return;
      }

      const normalizedTargetPath = resolvedPath.toLowerCase();
      const targetFileIndex = tryParent.data.findIndex((entry) =>
        !entry.isDir && entry.path.toLowerCase() === normalizedTargetPath,
      );

      if (targetFileIndex < 0) {
        addLog(`历史记录中的文件已不存在: ${item.file_path}`, 'warn');
        return;
      }

      const targetFile = tryParent.data[targetFileIndex];
      setSelectedPaths(new Set([targetFile.path]));
      setLastClickedIndex(targetFileIndex);
      setActiveUtilityPanel(null);
      addLog(`已从历史记录定位到文件: ${basename(targetFile.path)}`, 'success');
    } finally {
      setNavigatingHistoryPath(null);
    }
  }, [addLog, handleSourceTypeChange, loadDirectoryForSource, localPath, openListUrl, sourceType]);

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
      const res = await window.ipcRenderer.invoke('scanner:scan-selected', {
        type: sourceType,
        id: `src_${Date.now()}`,
        paths,
        path: sourceType === 'local' ? localPath : currentPath,
        url: openListUrl,
        token: openListToken
      });
      if (!res.success) { addLog(res.error, 'error'); setScanning(false); }
    } else {
      if (!currentPath) return;
      addLog(`开始递归扫描目录: ${currentPath}`, 'info');
      const res = await window.ipcRenderer.invoke('scanner:start', {
        type: sourceType,
        id: `src_${Date.now()}`,
        path: currentPath,
        rootPath: sourceType === 'local' ? localPath : undefined,
        url: openListUrl,
        token: openListToken
      });
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
    await window.ipcRenderer.invoke('config:set', 'openlist_batch_size', openListBatchSizeInput);
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
    const newRule: RuleDefinition = { id: `rule_${Date.now()}`, pattern: '', type: 'tv' };
    setRules([...rules, newRule]);
  };

  const handleUpdateRule = (idx: number, field: keyof RuleDefinition, value: string) => {
    const newRules = [...rules];
    newRules[idx] = { ...newRules[idx], [field]: value };
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

  const handleShowEpisodeDetail = async (item: EpisodeMatchItem) => {
    const showId = item.tmdbId;
    if (!item.metadata || !showId) return;
    setLoadingDetail(true);
    setSelectedEpisodeDetail({ ...item.metadata, season: item.match.season, episode: item.match.episode });
    try {
      const fullData = await window.ipcRenderer.invoke('metadata:getEpisodeDetail', {
        showId,
        season: item.match.season ?? 1,
        episode: item.match.episode ?? 1,
      });
      if (fullData) {
        setSelectedEpisodeDetail({
          ...fullData,
          season: item.match.season,
          episode: item.match.episode,
          overview: fullData.overview || item.metadata.overview
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleSelection = (path: string, index: number, event?: { ctrlKey: boolean; shiftKey: boolean }) => {
    const newSet = new Set(selectedPaths);

    // Shift 键：范围选择
    if (event?.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);

      for (let i = start; i <= end; i++) {
        const file = fileList[i];
        if (!file.isDir) {
          newSet.add(file.path);
        }
      }
    }
    // Ctrl 键：切换单个选择
    else if (event?.ctrlKey) {
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
    }
    // 普通点击：替换选择
    else {
      newSet.clear();
      newSet.add(path);
    }

    setSelectedPaths(newSet);
    setLastClickedIndex(index);
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

  const openUtilityPanel = async (panel: 'history' | 'logs') => {
    setActiveUtilityPanel(panel);
    if (panel === 'history') {
      await refreshMedia({ silent: true });
    }
  };
  const isConfigured = (sourceType === 'local' && localPath) || (sourceType === 'openlist' && openListUrl);
  const totalDirectoryCount = fileList.filter((item) => item.isDir).length;
  const totalFileCount = fileList.length - totalDirectoryCount;
  const allFilesSelected = totalFileCount > 0 && selectedPaths.size === totalFileCount;

  const runUpdateCheck = useCallback(async (options?: { silent?: boolean }) => {
    if (updateCheckInFlightRef.current) return;

    const silent = options?.silent ?? false;
    updateCheckInFlightRef.current = true;
    if (!silent) {
      setIsCheckingUpdate(true);
      addLog('正在检查更新...', 'info');
    }

    try {
      const result = await window.ipcRenderer.invoke('update:check');
      if (result.hasUpdate) {
        setIsUpdateReady(false);
        setDownloadProgress(0);
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          releaseNote: result.releaseNote || '暂无发布说明',
        });
        setShowUpdateDialog(true);
        addLog(`发现新版本: v${result.latestVersion}`, 'success');
      } else {
        if (!silent && result.error) {
          addLog(`检查更新失败: ${result.error}`, 'error');
        } else if (!silent) {
          addLog('当前已是最新版本', 'success');
        }
      }
    } catch (error) {
      if (!silent) {
        addLog(`检查更新出错: ${getErrorMessage(error)}`, 'error');
      }
    } finally {
      updateCheckInFlightRef.current = false;
      if (!silent) {
        setIsCheckingUpdate(false);
      }
    }
  }, [addLog]);

  const handleCheckUpdate = async () => {
    await runUpdateCheck();
  };

  const handleDownloadUpdate = async () => {
    if (isUpdateReady) {
      addLog('正在退出并安装更新...', 'info');
      await window.ipcRenderer.invoke('update:install');
      return;
    }

    if (!updateInfo || isDownloadingUpdate) return;

    setIsDownloadingUpdate(true);
    setDownloadProgress(0);
    addLog('开始下载更新...', 'info');

    try {
      const result = await window.ipcRenderer.invoke('update:download');
      if (result?.success) {
        setIsUpdateReady(true);
        setDownloadProgress(100);
      } else {
        addLog(`下载更新失败: ${result?.error || '未知错误'}`, 'error');
      }
    } catch (error) {
      addLog(`更新失败: ${getErrorMessage(error)}`, 'error');
    } finally {
      setIsDownloadingUpdate(false);
    }
  };

  useEffect(() => {
    if (!appVersion) return;

    const timer = window.setTimeout(() => {
      runUpdateCheck({ silent: true });
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [appVersion, runUpdateCheck]);

  useEffect(() => {
    if (activeTab === 'dashboard' && !isScanning) {
      if ((sourceType === 'local' && localPath) || (sourceType === 'openlist' && openListUrl)) {
        const nextPath = sourceType === 'local'
          ? (isWithinLocalRoot(currentPath, localPath) ? currentPath : localPath)
          : (isValidOpenListPath(currentPath) ? currentPath : '');
        loadDirectory(nextPath);
      }
    }
  }, [activeTab, currentPath, isScanning, loadDirectory, localPath, openListUrl, sourceType]);

  useEffect(() => {
    if (activeTab !== 'dashboard' && activeUtilityPanel) {
      setActiveUtilityPanel(null);
    }
  }, [activeTab, activeUtilityPanel]);

  useEffect(() => {
    if (viewMode !== 'grid' || fileList.length === 0 || !currentPath) {
      setThumbnailByPath({});
      return;
    }

    let cancelled = false;
    const config = { localPath, openListUrl, openListToken };

    const resolveThumbnails = async () => {
      const next: Record<string, string> = {};

      // File cards: use sibling *-thumb.jpg in the same directory.
      const fileByName = new Map(fileList.map((entry) => [entry.name.toLowerCase(), entry]));
      for (const entry of fileList) {
        if (entry.isDir) continue;
        const sidecar = fileByName.get(getThumbSidecarName(entry.name).toLowerCase());
        if (!sidecar?.previewUrl) continue;
        next[entry.path] = sidecar.previewUrl;
      }

      // Directory cards: probe child directory and prefer poster.jpg.
      const directories = fileList.filter((entry) => entry.isDir);
      await Promise.all(directories.map(async (directory) => {
        try {
          const result = await window.ipcRenderer.invoke('explorer:list', {
            type: sourceType,
            path: directory.path,
            config,
          });
          if (!result.success) return;
          const posterEntry = result.data.find((entry) => !entry.isDir && entry.name.toLowerCase() === 'poster.jpg');
          if (!posterEntry?.previewUrl) return;
          next[directory.path] = posterEntry.previewUrl;
        } catch {
          // Ignore and fallback to icon for this card.
        }
      }));

      if (!cancelled) {
        setThumbnailByPath(next);
      }
    };

    void resolveThumbnails();

    return () => {
      cancelled = true;
    };
  }, [currentPath, fileList, localPath, openListToken, openListUrl, sourceType, viewMode]);

  const isMovieWorkflow = Boolean(
    wizardData.matches && wizardData.matches.some((item) => item.match.mediaType === 'movie')
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Title Bar */}
      <div className="fixed top-0 left-0 right-0 h-8 z-[100] flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 select-none" style={dragRegionStyle}>
        <div className="px-3 flex items-center gap-2 text-[11px] font-bold text-slate-500 tracking-wider uppercase">
          <img
            src="./app-icon.png"
            alt="OpenList Scraper"
            className="w-4 h-4 rounded-[4px] object-cover shadow-sm"
            draggable={false}
          />
          <span>OpenList 媒体整理</span>
          <button
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[9px] font-black text-slate-400 dark:text-slate-500 tracking-normal transition-colors cursor-pointer disabled:opacity-50"
            style={noDragRegionStyle}
            title="点击检查更新"
          >
            {isCheckingUpdate ? "Checking..." : (appVersion ? `V${appVersion}` : '...')}
          </button>
        </div>

        <div className="flex h-full items-center" style={noDragRegionStyle}>
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

            {isUpdateReady && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                更新包已下载完成，点击下方按钮后应用将退出并安装新版本。
              </div>
            )}

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
                disabled={isDownloadingUpdate}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                {isDownloadingUpdate ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Downloading {downloadProgress}%
                  </>
                ) : isUpdateReady ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    重启并安装
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
                    (sourceType === 'local' ? getLocalBreadcrumbParts(currentPath, localPath) : currentPath.split(/[\\/]/).filter(Boolean)).map((part, index, arr) => {
                      const isLast = index === arr.length - 1;
                      return (
                        <div key={index} className="flex items-center text-xs">
                          <span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span>
                          <button
                            onClick={() => {
                              const newPath = sourceType === 'local'
                                ? [localPath, ...arr.slice(0, index + 1)].join('\\')
                                : (() => {
                                    const sep = currentPath.includes('\\') ? '\\' : '/';
                                    const parts = currentPath.split(sep).filter(Boolean);
                                    const partIndex = parts.lastIndexOf(part);
                                    let computedPath = parts.slice(0, partIndex + 1).join(sep);
                                    if (sep === '\\' && computedPath.length === 2 && computedPath.endsWith(':')) computedPath += '\\';
                                    if (sep === '/' && !computedPath.startsWith('/')) computedPath = '/' + computedPath;
                                    return computedPath;
                                  })();
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
                <button
                  type="button"
                  onClick={() => openUtilityPanel('history')}
                  className={clsx(
                    "h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-2 border transition-all",
                    activeUtilityPanel === 'history'
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                  title="查看刮削历史"
                >
                  <Database className="w-4 h-4" />
                  <span>历史</span>
                </button>

                <button
                  type="button"
                  onClick={() => openUtilityPanel('logs')}
                  className={clsx(
                    "h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-2 border transition-all",
                    activeUtilityPanel === 'logs'
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                  title="查看活动日志"
                >
                  <File className="w-4 h-4" />
                  <span>日志</span>
                  {isScanning && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                </button>

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
                          allFilesSelected
                            ? <Check className="w-2.5 h-2.5 text-white" />
                            : <Minus className="w-2.5 h-2.5 text-white" />
                        )}
                      </div>
                      {allFilesSelected ? '取消全选' : '全选'}
                    </button>

                    <button onClick={handleStartScan} disabled={isScanning || (!currentPath && selectedPaths.size === 0)} className={clsx("h-9 px-4 rounded-lg text-xs font-bold flex items-center gap-2 transition-all", isScanning || (!currentPath && selectedPaths.size === 0) ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700" : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20")}>
                      {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 fill-current" />}
                      {isScanning ? '扫描中...' : (selectedPaths.size > 0 ? `匹配选中 (${selectedPaths.size})` : '扫描目录')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/50 dark:bg-slate-950/50">
              {!isConfigured ? (
                <div className="h-full min-h-[420px] flex items-center justify-center">
                  <div className="max-w-md text-center px-6">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                      <Folder className="w-7 h-7 text-slate-400" />
                    </div>
                    <h2 className="mt-5 text-xl font-black text-slate-900 dark:text-slate-100">准备开始浏览媒体库</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">
                      主视图会像文件资源管理器一样展示目录和媒体文件。先配置一个数据源，然后从左上路径栏进入你的媒体库。
                    </p>
                    <button
                      onClick={() => { setActiveTab('settings'); setSettingsTab('library'); }}
                      className="mt-6 h-10 px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold inline-flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                    >
                      配置数据源
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : loadingFiles ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin opacity-50" />
                  <span className="text-xs font-medium uppercase tracking-widest">正在加载目录...</span>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Explorer
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {totalDirectoryCount} 个目录 · {totalFileCount} 个文件
                    </div>
                  </div>

                  {viewMode === 'list' && fileList.length > 0 && (
                    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_160px_120px] items-center rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      <span>名称</span>
                      <span>修改时间</span>
                      <span className="text-right">大小</span>
                    </div>
                  )}

                  <div className={clsx(
                    viewMode === 'grid'
                      ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4"
                      : "flex flex-col gap-1.5"
                  )}>
                    {fileList.length === 0 && (
                      <div className={clsx("col-span-full flex flex-col items-center justify-center text-slate-400 gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50", viewMode === 'grid' ? "py-20" : "py-16")}>
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-1">
                          <Folder className="w-8 h-8 opacity-60" />
                        </div>
                        <span className="font-bold text-sm text-slate-600 dark:text-slate-300">此目录为空</span>
                        <span className="text-xs opacity-80">可以返回上级目录，或切换到其他路径继续浏览。</span>
                      </div>
                    )}

                    {fileList.map((file, i) => {
                      const isSelected = selectedPaths.has(file.path);
                      const thumbnailUrl = failedThumbnailPaths.has(file.path) ? undefined : thumbnailByPath[file.path];
                      return (
                        <div
                          key={file.path}
                          onClick={(e) => { if (file.isDir) handleNavigate(file.path); else toggleSelection(file.path, i, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }); }}
                          className={clsx(
                            "group relative rounded-xl border transition-all duration-200 cursor-pointer select-none",
                            viewMode === 'grid'
                              ? "p-3 flex flex-col min-h-[228px]"
                              : "grid grid-cols-[minmax(0,1fr)_160px_120px] items-center gap-2 px-3 py-2.5",
                            isSelected
                              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500/50 shadow-sm ring-1 ring-blue-500/20"
                              : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm"
                          )}
                        >
                          {viewMode === 'grid' ? (
                            <>
                              <div className={clsx(
                                "relative w-full overflow-hidden rounded-lg border",
                                file.isDir
                                  ? "aspect-[4/3] bg-blue-50/60 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/70"
                                  : "aspect-[16/10] bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              )}>
                                {!file.isDir && (
                                  <div
                                    className={clsx(
                                      "absolute top-2 right-2 z-20 w-5 h-5 rounded border flex items-center justify-center transition-all",
                                      isSelected
                                        ? "bg-blue-500 border-blue-500"
                                        : "border-slate-300/90 dark:border-slate-600 bg-white/80 dark:bg-slate-900/80 hover:border-blue-400"
                                    )}
                                    onClick={(e) => { e.stopPropagation(); toggleSelection(file.path, i, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }); }}
                                  >
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                )}

                                {thumbnailUrl ? (
                                  <img
                                    src={thumbnailUrl}
                                    alt={file.name}
                                    className="w-full h-full object-cover"
                                    onError={() => {
                                      setFailedThumbnailPaths((prev) => {
                                        const next = new Set(prev);
                                        next.add(file.path);
                                        return next;
                                      });
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <div className={clsx(
                                      "w-11 h-11 rounded-xl border flex items-center justify-center",
                                      file.isDir
                                        ? "bg-blue-100/80 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300"
                                        : "bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300"
                                    )}>
                                      {file.isDir ? <Folder className="w-5 h-5" /> : <File className="w-5 h-5" />}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="mt-3 min-w-0">
                                <div className={clsx("truncate text-sm", file.isDir ? "text-slate-900 dark:text-slate-100 font-bold" : "text-slate-700 dark:text-slate-200 font-medium")}>
                                  {file.name}
                                </div>
                                <div className="mt-1 text-[11px] text-slate-400 truncate">
                                  {file.isDir ? '文件夹' : getFileExtension(file.name)}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {!file.isDir && (
                                <div
                                  className={clsx(
                                    "w-4 h-4 rounded border flex shrink-0 items-center justify-center transition-all",
                                    isSelected
                                      ? "bg-blue-500 border-blue-500"
                                      : "border-slate-300 dark:border-slate-600 hover:border-blue-400 bg-white dark:bg-slate-800"
                                  )}
                                  onClick={(e) => { e.stopPropagation(); toggleSelection(file.path, i, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }); }}
                                >
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                              )}
                              {file.isDir && <div className="w-4 h-4 shrink-0" />}

                              <div className={clsx(
                                "w-8 h-8 shrink-0 rounded-lg border flex items-center justify-center",
                                file.isDir
                                  ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300"
                                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300"
                              )}>
                                {file.isDir ? <Folder className="w-4 h-4" /> : <File className="w-4 h-4" />}
                              </div>

                              <div className="min-w-0">
                                <div className={clsx("truncate text-sm", file.isDir ? "text-slate-900 dark:text-slate-100 font-bold" : "text-slate-700 dark:text-slate-200 font-medium")}>
                                  {file.name}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {file.isDir ? '文件夹' : getFileExtension(file.name)}
                                </div>
                              </div>
                            </div>
                          )}

                          {viewMode === 'list' && (
                            <>
                              <div className="text-[11px] text-slate-400 font-medium truncate">
                                {file.isDir ? '--' : formatExplorerMtime(file.mtime)}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 text-right font-semibold tabular-nums">
                                {file.isDir ? '--' : formatFileSize(file.size)}
                              </div>
                            </>
                          )}

                          {viewMode === 'grid' && (
                            <div className="mt-auto pt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.14em]">
                              <span className="text-slate-400">{file.isDir ? 'Folder' : getFileExtension(file.name)}</span>
                              <span className="text-slate-500 dark:text-slate-400 font-semibold tabular-nums">{file.isDir ? '--' : formatFileSize(file.size)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && activeUtilityPanel === 'history' && (
          <UtilityDrawer
            title="Scrape History"
            subtitle="刮削历史"
            onClose={() => setActiveUtilityPanel(null)}
            actions={(
              <button
                type="button"
                onClick={() => refreshMedia()}
                disabled={isRefreshingHistory}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 transition-colors disabled:opacity-50"
                title="刷新历史记录"
              >
                <RefreshCw className={clsx("w-3.5 h-3.5", isRefreshingHistory && "animate-spin")} />
                刷新
              </button>
            )}
          >
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">总记录</div>
                <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{media.length}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">最近一次</div>
                <div className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {media[0] ? formatRelativeScrapedAt(media[0].scraped_at) : '暂无'}
                </div>
                <div className="mt-1 text-[11px] text-slate-400 truncate">
                  {media[0] ? formatScrapedAt(media[0].scraped_at) : '等待首条记录'}
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {media.length === 0 ? (
                <div className="min-h-[280px] rounded-[28px] border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col items-center justify-center text-center px-6">
                  <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Database className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">还没有历史记录</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    完成一次批量刮削后，这里会按时间倒序展示剧集标题、季集号、时间和文件路径。
                  </p>
                </div>
              ) : (
                media.map((item, index) => (
                  <MediaHistoryItem
                    key={item.id ?? `${item.file_path}-${index}`}
                    item={item}
                    onNavigate={handleOpenHistoryItem}
                    isNavigating={navigatingHistoryPath === item.file_path}
                  />
                ))
              )}
            </div>
          </UtilityDrawer>
        )}

        {activeTab === 'dashboard' && activeUtilityPanel === 'logs' && (
          <UtilityDrawer
            title="Activity Log"
            subtitle="活动日志"
            onClose={() => setActiveUtilityPanel(null)}
            widthClassName="w-[460px]"
            actions={(
              <button
                type="button"
                onClick={clearLogs}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 transition-colors"
                title="清空日志"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空
              </button>
            )}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span className={clsx("w-2 h-2 rounded-full", isScanning ? "bg-amber-400 animate-pulse" : "bg-emerald-400")} />
                {isScanning ? '扫描进行中' : '当前空闲'}
              </div>
              <div className="text-[11px] text-slate-400">{logs.length} 条记录</div>
            </div>

            <div className="p-4 font-mono text-[11px] space-y-2">
              {logs.length === 0 ? (
                <div className="min-h-[240px] rounded-[24px] border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-center text-slate-400 italic">
                  系统就绪，等待任务...
                </div>
              ) : (
                logs.map((log, i) => <LogItem key={i} log={log} />)
              )}
            </div>
          </UtilityDrawer>
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
                        <select value={logLevel} onChange={(e) => setLogLevel(e.target.value as LogLevel)} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs outline-none font-bold">
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
                      <button key={type} onClick={() => handleSourceTypeChange(type as 'local' | 'openlist')} className={clsx("flex-1 p-4 rounded-xl border-2 text-left transition-all", sourceType === type ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/10" : "border-slate-200 dark:border-slate-800")}>
                        <div className="font-bold capitalize">{type}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{type === 'local' ? '扫描本地文件夹' : '同步 OpenList 服务器'}</div>
                      </button>
                    ))}
                  </div>
                  {sourceType === 'local' ? (
                    <div className="space-y-2"><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">文件夹路径</label><div className="flex gap-2"><input type="text" value={localPathInput} onChange={e => setLocalPathInput(e.target.value)} className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none" /><button onClick={handleBrowseLocal} className="bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-slate-200 dark:border-slate-700"><Folder className="w-4 h-4" /> 浏览</button></div></div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">服务器地址 (URL)</label>
                        <input type="text" value={openListUrlInput} onChange={e => setOpenListUrlInput(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">访问令牌 (Token)</label>
                        <div className="relative">
                          <input type={showOpenListToken ? "text" : "password"} value={openListTokenInput} onChange={e => setOpenListTokenInput(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-4 pr-10 py-2 text-sm outline-none" />
                          <button onClick={() => setShowOpenListToken(!showOpenListToken)} className="absolute right-3 top-2.5 text-slate-400">{showOpenListToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">批量重命名批次大小</label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={openListBatchSizeInput}
                          onChange={e => setOpenListBatchSizeInput(e.target.value)}
                          placeholder="20"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20"
                        />
                        <p className="text-xs text-slate-400">
                          每批最多提交多少个文件的重命名请求（推荐 10-30，避免一次性提交过多导致失败）
                        </p>
                      </div>
                      <TestButton onClick={handleTestOpenList} loading={isTestingOpenList} label="测试连接" />
                      <StatusMessage result={openListTestResult} />
                    </div>
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
              <div>
                <h2 className="text-xl font-bold">
                  {wizardStage === 'series' && "请选择正确的条目"}
                  {wizardStage === 'loading_episodes' && "正在获取元数据"}
                  {wizardStage === 'episodes' && "审查与执行操作"}
                  {wizardStage === 'executing' && "正在执行操作"}
                  {wizardStage === 'finished' && "任务已完成"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {wizardStage === 'series' && (
                    <span>
                      检测到： <span className="text-blue-500 font-bold">{wizardData.detectedName}</span> • 当前类型：
                      <span className="font-bold">{searchModeOptions.find((option) => option.value === (wizardData.searchMode ?? 'auto'))?.label}</span>
                    </span>
                  )}
                  {wizardStage === 'episodes' && (
                    <span>
                      {isMovieWorkflow ? '电影' : '剧集'}：
                      <span className="text-blue-500 font-bold"> {wizardData.seriesName}</span> •
                      <span className="font-bold"> {selectedIndices.length}</span> 个项目
                    </span>
                  )}
                </p>
              </div>
              {(wizardStage === 'loading_episodes' || wizardStage === 'executing') && (
                <button onClick={handleCancelCurrentTask} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">
                  停止任务
                </button>
              )}
              {(wizardStage === 'series' || wizardStage === 'episodes' || wizardStage === 'finished') && <button onClick={closeWizard} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>}
            </div>
            {wizardStage === 'series' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
                  {searchModeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSearchModeChange(option.value)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        (wizardData.searchMode ?? 'auto') === option.value
                          ? "bg-blue-600 text-white"
                          : "text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mb-4">
                  <label className="text-xs font-bold text-blue-500 uppercase tracking-widest block mb-2">识别结果不准确？手动搜索：</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualSeriesName}
                      onChange={e => setManualSeriesName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                      placeholder="输入剧名或电影名..."
                      className="flex-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500"
                    />
                    <button onClick={handleManualSearch} disabled={!manualSeriesName.trim()} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      重试
                    </button>
                  </div>
                </div>
                {wizardData.notice && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                    {wizardData.notice}
                  </div>
                )}
                {wizardData.seriesResults === undefined && (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3 text-slate-400">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500 opacity-50" />
                    <span className="text-xs font-medium uppercase tracking-widest">正在搜索 "{manualSeriesName}"...</span>
                  </div>
                )}
                {wizardData.seriesResults !== undefined && wizardData.seriesResults.length === 0 && <div className="text-center py-10 text-slate-400">未找到相关结果，请切换搜索类型或尝试其他关键词。</div>}

                {wizardData.seriesResults && wizardData.seriesResults.map((item) => (
                  <div key={`${item.mediaType}:${item.id}`} onClick={() => handleConfirmSeries(item)} className="flex gap-4 p-3 rounded-xl border hover:border-blue-500 cursor-pointer transition-all">
                    {item.poster ? <img src={item.poster} className="w-20 h-28 object-cover rounded-md" alt="" /> : <div className="w-20 h-28 bg-slate-100 rounded-md flex items-center justify-center"><File className="w-8 h-8 text-slate-400" /></div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-lg truncate">{item.title} ({item.year || 'N/A'})</h4>
                        <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-bold", item.mediaType === 'movie' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>
                          {item.mediaType === 'movie' ? '电影' : '电视剧'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-3 mt-1">{item.overview}</p>
                    </div>
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
                    {batchOptionDefinitions.map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={batchOptions[opt.id]} onChange={() => toggleOption(opt.id)} className="w-4 h-4 rounded text-blue-600" />
                        <span className="text-xs font-bold">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Batch Edit Actions */}
                {!isMovieWorkflow && selectedIndices.length > 1 && (
                  <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-900/30">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        批量操作 ({selectedIndices.length} 个文件)
                      </span>
                      <button
                        onClick={() => {
                          setBatchEditMode('season');
                          if (wizardData.matches && selectedIndices.length > 0) {
                            setBatchSeasonValue(wizardData.matches[selectedIndices[0]].match.season ?? 1);
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                      >
                        批量改季
                      </button>
                      <button
                        onClick={() => {
                          setBatchEditMode('episode');
                          if (wizardData.matches && selectedIndices.length > 0) {
                            const firstIdx = selectedIndices[0];
                            setAnchorIndex(firstIdx);
                            setAnchorEpisode(wizardData.matches[firstIdx].match.episode ?? 1);
                          }
                        }}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                      >
                        智能改集
                      </button>
                    </div>
                  </div>
                )}
                {/* Smart Identify Button */}
                {!isMovieWorkflow && wizardData.matches && wizardData.matches.some((item) => !item.match.success || item.match.source === 'unmatched') && (
                  <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-900/30">
                    <button
                      onClick={handleSmartIdentify}
                      disabled={smartIdentifying}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {smartIdentifying ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          正在智能识别...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          智能识别未匹配文件
                        </>
                      )}
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      使用 AI 识别正则匹配失败的文件（共 {wizardData.matches.filter((item) => !item.match.success || item.match.source === 'unmatched').length} 个）
                    </p>
                  </div>
                )}
                {/* Fetch Metadata Button */}
                {!isMovieWorkflow && !metadataFetched && !fetchingMetadata && wizardData.matches && wizardData.matches.some((item) => !item.metadata) && (
                  <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-200 dark:border-blue-900/30">
                    <button
                      onClick={handleFetchMetadata}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      获取元数据
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      确认季集无误后，点击此按钮获取TMDB元数据
                    </p>
                  </div>
                )}
                {/* Global Loading Overlay for Metadata Fetch */}
                {fetchingMetadata && (
                  <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-b border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100">正在获取元数据</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          {metadataProgress?.total > 0 ? (
                            `已获取 ${metadataProgress.current}/${metadataProgress.total} 集`
                          ) : (
                            '从 TMDB 获取详情中，请稍候...'
                          )}
                        </p>
                      </div>
                      {metadataProgress?.total > 0 && (
                        <div className="text-right">
                          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {Math.round((metadataProgress.current / metadataProgress.total) * 100)}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto max-h-[60vh]">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase"><tr><th className="px-6 py-3 w-12"><input type="checkbox" checked={selectedIndices.length === wizardData.matches?.length} onChange={toggleSelectIndicesAll} /></th><th>预览</th><th className="w-24">识别结果</th><th>元数据</th></tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {wizardData.matches?.map((item, idx) => {
                        const fileExt = item.file.name.substring(item.file.name.lastIndexOf('.'));
                        const isMovieItem = item.match.mediaType === 'movie';
                        // 根据总集数自动计算需要的位数（最少2位）
                        const episodeDigits = Math.max(2, String(item.match.totalEpisodes || 0).length);
                        const movieYear = item.metadata?.airDate?.slice(0, 4);
                        const newName = item.metadata
                          ? (isMovieItem
                            ? `${item.metadata.title}${movieYear ? ` (${movieYear})` : ''}${fileExt}`
                            : `${wizardData.seriesName} - S${String(item.match.season ?? 1).padStart(2, '0')}E${String(item.match.episode ?? 1).padStart(episodeDigits, '0')} - ${item.metadata.title}${fileExt}`)
                          : '';
                        return (
                          <tr key={idx} className={clsx(!selectedIndices.includes(idx) && "opacity-50")}>
                            <td className="px-6 py-4"><input type="checkbox" checked={selectedIndices.includes(idx)} onChange={() => toggleIndex(idx)} /></td>
                            <td className="px-6 py-4 text-[11px]">
                              <div className="text-slate-400 truncate">{item.file.name}</div>
                              {batchOptions.rename && newName && newName !== item.file.name && (<div className="text-green-600 font-bold truncate">→ {newName}</div>)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {isMovieItem ? (
                                <span className="px-2 py-1 rounded text-xs font-bold text-amber-700 bg-amber-100">
                                  电影
                                </span>
                              ) : (
                                <button
                                  onClick={() => { setEditingMatchIndex(idx); setEditMatchValues({ season: item.match.season ?? 1, episode: item.match.episode ?? 1 }); }}
                                  className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
                                >
                                  S{String(item.match.season ?? 1).padStart(2, '0')}E{String(item.match.episode ?? 1).padStart(Math.max(2, String(item.match.totalEpisodes || 0).length), '0')}
                                </button>
                              )}
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

      {/* Batch Season Edit Modal */}
      {batchEditMode === 'season' && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold">批量修改季</h3>
              <button onClick={() => setBatchEditMode(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                将 <span className="font-bold text-blue-600">{selectedIndices.length}</span> 个文件的季统一修改为：
              </p>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">季 (Season)</label>
                <input
                  type="number"
                  min="0"
                  value={batchSeasonValue}
                  onChange={e => setBatchSeasonValue(parseInt(e.target.value) ?? 1)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 ring-blue-500/20 transition-all"
                />
              </div>
              <p className="text-[10px] text-slate-400 italic">修改后将更新预览，元数据将在点击"执行"时统一获取。</p>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setBatchEditMode(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">取消</button>
                <button onClick={handleBatchSeasonUpdate} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/30 transition-all">确认</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Episode Edit Modal */}
      {batchEditMode === 'episode' && wizardData.matches && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold">智能批量修改集</h3>
                <p className="text-xs text-slate-500 mt-1">选择一个文件作为基准，其他文件将根据偏移量自动调整</p>
              </div>
              <button onClick={() => { setBatchEditMode(null); setAnchorIndex(null); }} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedIndices.map(idx => {
                const item = wizardData.matches![idx];
                const originalEpisode = item.match.episode ?? 1;
                const isAnchor = anchorIndex === idx;
                const calculatedEpisode = anchorIndex !== null && !isAnchor
                  ? originalEpisode + (anchorEpisode - (wizardData.matches![anchorIndex].match.episode ?? 1))
                  : originalEpisode;

                return (
                  <div key={idx} className={clsx(
                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                    isAnchor ? "bg-green-50 dark:bg-green-900/10 border-green-500" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  )}>
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="text-xs font-bold text-slate-500">E{String(originalEpisode).padStart(2, '0')}</div>
                      <div className="text-xs text-slate-400 truncate mt-1">{item.file.name}</div>
                    </div>
                    {isAnchor ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-green-600">→</span>
                        <input
                          type="number"
                          min="1"
                          value={anchorEpisode}
                          onChange={e => setAnchorEpisode(parseInt(e.target.value) ?? 1)}
                          className="w-20 bg-white dark:bg-slate-900 border border-green-500 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 ring-green-500/20"
                        />
                        <span className="text-xs font-bold text-green-600">（基准）</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600">→ E{String(calculatedEpisode).padStart(2, '0')}</span>
                        <button
                          onClick={() => { setAnchorIndex(idx); setAnchorEpisode(originalEpisode); }}
                          className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        >
                          设为基准
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {anchorIndex !== null && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 rounded-xl">
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-400">
                    偏移量：{anchorEpisode - (wizardData.matches[anchorIndex].match.episode ?? 1) > 0 ? '+' : ''}
                    {anchorEpisode - (wizardData.matches[anchorIndex].match.episode ?? 1)}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3">
              <button onClick={() => { setBatchEditMode(null); setAnchorIndex(null); }} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">取消</button>
              <button onClick={handleBatchEpisodeUpdate} disabled={anchorIndex === null} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white bg-green-600 hover:bg-green-500 shadow-lg shadow-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">确认</button>
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
