import type {
  BatchOptions,
  EpisodeConfirmationPayload,
  EpisodeData,
  EpisodeMatchItem,
  FileItem,
  MetadataProgressPayload,
  MediaSearchMode,
  MediaType,
  RuleDefinition,
  ScannerLogPayload,
  ScannerOperationProgressPayload,
  SearchResult,
  SourceType,
  ThemeMode,
  UpdateDownloadProgressPayload,
  UpdateDownloadedPayload,
  ViewMode,
  LogLevel,
} from './types';
import type { ScrapedMediaRecord } from '../src/stores/appStore';

export interface SuccessResponse {
  success: true;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type AsyncResult<T> = ({ success: true } & T) | ErrorResponse;

export interface ExplorerConfig {
  localPath?: string;
  openListUrl?: string;
  openListToken?: string;
}

export interface ExplorerListRequest {
  type: SourceType;
  path: string;
  config: ExplorerConfig;
}

export type ExplorerListResponse = AsyncResult<{
  data: FileItem[];
  currentPath: string;
}>;

export interface SourceBaseRequest {
  type: SourceType;
  id: string;
  path: string;
  url?: string;
  token?: string;
}

export interface ScanSourceRequest extends SourceBaseRequest {
  rootPath?: string;
}

export interface ScanSelectedRequest extends SourceBaseRequest {
  paths: string[];
}

export interface LlmTestRequest {
  apiKey: string;
  baseURL?: string;
}

export type LlmTestResponse = AsyncResult<{
  models: string[];
}>;

export interface OpenListTestRequest {
  url: string;
  token: string;
}

export interface MetadataDetailRequest {
  showId: string;
  season: number;
  episode: number;
}

export interface FetchMetadataRequest {
  matches: EpisodeMatchItem[];
  seriesId: string;
}

export type FetchMetadataResponse = AsyncResult<{
  matches: EpisodeMatchItem[];
}>;

export interface SmartIdentifyRequest {
  unmatchedFiles: EpisodeMatchItem[];
}

export type SmartIdentifyResponse = AsyncResult<{
  results: EpisodeMatchItem[];
}>;

export interface CheckUpdateResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNote?: string;
  error?: string;
}

export interface DownloadUpdateResult {
  success: boolean;
  error?: string;
}

export type ConfigValueMap = {
  tmdb_api_key: string;
  openai_api_key: string;
  openai_base_url: string;
  openai_model: string;
  proxy_url: string;
  source_type: SourceType;
  local_path: string;
  openlist_url: string;
  openlist_token: string;
  openlist_batch_size: string;
  video_extensions: string;
  view_mode: ViewMode;
  batch_options: BatchOptions;
  theme: ThemeMode;
  log_level: LogLevel;
};

export type ConfigKey = keyof ConfigValueMap;

export interface ScannerRequireConfirmationPayload {
  detectedName: string;
  results: SearchResult[];
  searchMode: MediaSearchMode;
  notice?: string;
}

export interface ScannerConfirmResponsePayload {
  seriesId: string | null;
  newName?: string;
  seriesName?: string;
  mediaType?: MediaType;
  searchMode?: MediaSearchMode;
}

export interface ScannerEpisodesConfirmResponsePayload {
  confirmed: boolean;
  options?: BatchOptions;
  selectedIndices: number[];
  updatedMatches?: EpisodeMatchItem[];
}

export interface RendererEventPayloadMap {
  'main-process-message': string;
  'metadata-progress': MetadataProgressPayload;
  'scanner-log': ScannerLogPayload;
  'scanner-finished': undefined;
  'scanner-require-confirmation': ScannerRequireConfirmationPayload;
  'scanner-require-episodes-confirmation': EpisodeConfirmationPayload;
  'scanner-operation-progress': ScannerOperationProgressPayload;
  'update:download-progress': UpdateDownloadProgressPayload;
  'update:downloaded': UpdateDownloadedPayload;
  'update:error': { message: string };
}

export type RendererEventChannel = keyof RendererEventPayloadMap;

export interface WindowIpcRenderer {
  invoke(channel: 'app:getVersion'): Promise<string>;
  invoke<K extends ConfigKey>(channel: 'config:get', key: K): Promise<ConfigValueMap[K] | undefined>;
  invoke<K extends ConfigKey>(channel: 'config:set', key: K, value: ConfigValueMap[K]): Promise<void>;
  invoke(channel: 'dialog:openDirectory'): Promise<string | null>;
  invoke(channel: 'explorer:list', request: ExplorerListRequest): Promise<ExplorerListResponse>;
  invoke(channel: 'llm:test', request: LlmTestRequest): Promise<LlmTestResponse>;
  invoke(channel: 'media:getAll'): Promise<ScrapedMediaRecord[]>;
  invoke(channel: 'metadata:getEpisodeDetail', request: MetadataDetailRequest): Promise<EpisodeData | null>;
  invoke(channel: 'openlist:test', request: OpenListTestRequest): Promise<AsyncResult<Record<string, never>>>;
  invoke(channel: 'proxy:test'): Promise<AsyncResult<Record<string, never>>>;
  invoke(channel: 'rules:get'): Promise<RuleDefinition[]>;
  invoke(channel: 'rules:save', rules: RuleDefinition[]): Promise<SuccessResponse>;
  invoke(channel: 'scanner:fetch-metadata', request: FetchMetadataRequest): Promise<FetchMetadataResponse>;
  invoke(channel: 'scanner:identify-single', request: ScanSourceRequest): Promise<AsyncResult<Record<string, never>>>;
  invoke(channel: 'scanner:cancel'): Promise<SuccessResponse>;
  invoke(channel: 'scanner:scan-selected', request: ScanSelectedRequest): Promise<AsyncResult<Record<string, never>>>;
  invoke(channel: 'scanner:smart-identify', request: SmartIdentifyRequest): Promise<SmartIdentifyResponse>;
  invoke(channel: 'scanner:start', request: ScanSourceRequest): Promise<AsyncResult<Record<string, never>>>;
  invoke(channel: 'system:openExternal', url: string): Promise<boolean>;
  invoke(channel: 'tmdb:test', token: string): Promise<AsyncResult<Record<string, never>>>;
  invoke(channel: 'update:check'): Promise<CheckUpdateResult>;
  invoke(channel: 'update:download'): Promise<DownloadUpdateResult>;
  invoke(channel: 'update:install'): Promise<boolean>;

  on<K extends RendererEventChannel>(
    channel: K,
    listener: RendererEventPayloadMap[K] extends undefined
      ? () => void
      : (payload: RendererEventPayloadMap[K]) => void,
  ): () => void;

  send(channel: 'scanner-confirm-response', payload: ScannerConfirmResponsePayload): void;
  send(channel: 'scanner-episodes-confirm-response', payload: ScannerEpisodesConfirmResponsePayload): void;
  send(channel: 'window:close'): void;
  send(channel: 'window:maximize'): void;
  send(channel: 'window:minimize'): void;
}
