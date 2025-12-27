import { create } from 'zustand';

interface AppState {
  // Config
  tmdbKey: string;
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  proxyUrl: string; // Added
  
  // Source Config
  sourceType: 'local' | 'openlist';
  localPath: string;
  openListUrl: string;
  openListToken: string; // Changed from User/Pass
  
  // Scanner
  isScanning: boolean;
  videoExtensions: string; // Added
  logs: Array<{ message: string; type: 'info' | 'error' | 'success'; timestamp: number }>;
  
  // Media
  media: any[];

  // Actions
  setConfig: (key: string, value: string) => void;
  setVideoExtensions: (exts: string) => void; // Added
  addLog: (message: string, type: 'info' | 'error' | 'success') => void;
  setScanning: (status: boolean) => void;
  setMedia: (media: any[]) => void;
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

  setConfig: (key, value) => set((state) => ({ ...state, [key]: value })),
  setVideoExtensions: (videoExtensions) => set({ videoExtensions }),
  addLog: (message, type) => set((state) => ({ 
    logs: [...state.logs, { message, type, timestamp: Date.now() }].slice(-100) // Keep last 100
  })),
  setScanning: (status) => set({ isScanning: status }),
  setMedia: (media) => set({ media }),
}));
