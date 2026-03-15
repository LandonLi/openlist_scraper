import { create } from 'zustand';
import type { LogType, SourceType } from '../../shared/types';

export type { LogType };

export interface ScrapedMediaRecord {
  id?: number;
  file_path: string;
  source_id: string;
  series_name?: string;
  season?: number;
  episode?: number;
  tmdb_id?: string;
  episode_title?: string;
  overview?: string;
  poster?: string;
  still?: string;
  air_date?: string;
  runtime?: number;
  scraped_at: string;
}

interface AppConfigState {
  tmdbKey: string;
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  proxyUrl: string;
  sourceType: SourceType;
  localPath: string;
  openListUrl: string;
  openListToken: string;
}

interface AppState {
  // Config
  tmdbKey: string;
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  proxyUrl: string;

  // Source Config
  sourceType: SourceType;
  localPath: string;
  openListUrl: string;
  openListToken: string;

  // Scanner
  isScanning: boolean;
  videoExtensions: string; // Added
  logs: Array<{ message: string; type: LogType; timestamp: number }>;

  // Media

  // Media
  media: ScrapedMediaRecord[];

  // Actions
  setConfig: <K extends keyof AppConfigState>(key: K, value: AppConfigState[K]) => void;
  setVideoExtensions: (exts: string) => void;
  addLog: (message: string, type: LogType) => void;
  clearLogs: () => void;
  setScanning: (status: boolean) => void;
  setMedia: (media: ScrapedMediaRecord[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  tmdbKey: '',
  openaiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-3.5-turbo',
  proxyUrl: '',

  sourceType: 'local',
  localPath: '',
  openListUrl: '',
  openListToken: '',

  isScanning: false,
  videoExtensions: 'mkv,mp4,avi,mov,iso,rmvb',
  logs: [],
  media: [],

  setConfig: (key, value) =>
    set((state) => ({
      ...state,
      [key]: value,
    })),
  setVideoExtensions: (videoExtensions) => set({ videoExtensions }),
  addLog: (message, type) => set((state) => ({
    logs: [...state.logs, { message, type, timestamp: Date.now() }].slice(-100) // Keep last 100
  })),
  clearLogs: () => set({ logs: [] }),
  setScanning: (status) => set({ isScanning: status }),
  setMedia: (media) => set({ media }),
}));
