export type SourceType = 'local' | 'openlist';
export type MediaType = 'tv' | 'movie';
export type MediaSearchMode = 'auto' | MediaType;

export type LogType = 'info' | 'success' | 'error' | 'warn' | 'debug';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type ThemeMode = 'dark' | 'light';
export type ViewMode = 'list';
export type RuleType = 'tv' | 'movie' | 'anime';

export interface RuleDefinition {
  id: string;
  pattern: string;
  type: RuleType;
}

export interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  mtime?: string | number;
}

export interface SearchResult {
  id: string;
  title: string;
  originalTitle?: string;
  year?: string;
  poster?: string;
  overview?: string;
  provider: string;
  mediaType: MediaType;
}

export interface EpisodeData {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  airDate?: string;
  stillPath?: string;
  runtime?: number;
}

export interface MovieData {
  id: string;
  title: string;
  overview?: string;
  releaseDate?: string;
  posterPath?: string;
  runtime?: number;
}

export type MatchSource =
  | 'regex'
  | 'llm'
  | 'manual'
  | 'llm_context'
  | 'llm_dir'
  | 'unmatched'
  | 'llm_failed'
  | 'llm_error';

export interface MatchResult {
  success: boolean;
  seriesName?: string | null;
  season?: number | null;
  episode?: number | null;
  year?: string;
  mediaType?: MediaType;
  confidence?: number;
  source: MatchSource;
}

export interface ResolvedEpisodeMatch extends MatchResult {
  originalEpisode?: number | null;
  totalEpisodes?: number;
}

export interface EpisodeMatchItem {
  file: FileItem;
  match: ResolvedEpisodeMatch;
  metadata?: EpisodeData;
  tmdbId?: string;
}

export interface BatchOptions {
  rename: boolean;
  writeNfo: boolean;
  writePoster: boolean;
  writeStill: boolean;
}

export interface EpisodeConfirmationPayload {
  seriesName: string;
  matches: EpisodeMatchItem[];
}

export interface MetadataProgressPayload {
  current: number;
  total: number;
}

export interface ScannerOperationProgressPayload {
  percent: number;
  message: string;
  finished: boolean;
}

export interface ScannerLogPayload {
  message: string;
  type: LogType;
}

export interface UpdateDownloadProgressPayload {
  bytesPerSecond: number;
  delta: number;
  percent: number;
  total: number;
  transferred: number;
}

export interface UpdateDownloadedPayload {
  version: string;
  releaseNote: string;
}

export interface EpisodeDetailState extends EpisodeData {
  season?: number | null;
  episode?: number | null;
}

export interface OpenListListItem {
  name: string;
  is_dir: boolean;
  size?: number;
  modified?: string;
  created?: string;
}

export interface OpenListListResponseData {
  content?: OpenListListItem[];
}

export interface OpenListResponse<TData = unknown> {
  code: number;
  message?: string;
  data?: TData;
  success?: boolean;
}

export interface TmdbSearchResultItem {
  id: number;
  media_type?: MediaType;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
}

export interface TmdbSearchResponse {
  results: TmdbSearchResultItem[];
}

export interface TmdbEpisodeItem {
  id: number;
  season_number: number;
  episode_number: number;
  name: string;
  overview?: string;
  air_date?: string;
  still_path?: string | null;
  runtime?: number;
}

export interface TmdbMovieItem {
  id: number;
  title: string;
  overview?: string;
  release_date?: string;
  poster_path?: string | null;
  runtime?: number;
}

export interface TmdbSeasonResponse {
  episodes: TmdbEpisodeItem[];
}

export interface TmdbAuthResponse {
  success?: boolean;
  status_message?: string;
}
