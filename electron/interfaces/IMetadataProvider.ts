import type { EpisodeData, MediaSearchMode, MovieData, SearchResult } from '../../shared/types';

export type { EpisodeData, SearchResult };

export interface IMetadataProvider {
  name: string;
  search(query: string, mode?: MediaSearchMode): Promise<SearchResult[]>;
  getSeasonDetails(showId: string, season: number): Promise<EpisodeData[]>;
  getEpisodeDetails(showId: string, season: number, episode: number): Promise<EpisodeData | null>;
  getMovieDetails(movieId: string): Promise<MovieData | null>;
  setDebugLogger?(logger: (message: string) => void): void;
  setProxy?(proxyUrl: string): void;
}
