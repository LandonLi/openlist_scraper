import type { EpisodeData, SearchResult } from '../../shared/types';

export type { EpisodeData, SearchResult };

export interface IMetadataProvider {
  name: string;
  searchTVShow(query: string): Promise<SearchResult[]>;
  getSeasonDetails(showId: string, season: number): Promise<EpisodeData[]>;
  getEpisodeDetails(showId: string, season: number, episode: number): Promise<EpisodeData | null>;
  setDebugLogger?(logger: (message: string) => void): void;
  setProxy?(proxyUrl: string): void;
}
