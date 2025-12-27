export interface SearchResult {
  id: string; // Provider specific ID (e.g., TMDB ID)
  title: string;
  originalTitle?: string;
  year?: string;
  poster?: string;
  overview?: string;
  provider: string; // 'tmdb', 'tvdb', etc.
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

export interface IMetadataProvider {
  name: string;
  searchTVShow(query: string): Promise<SearchResult[]>;
  getSeasonDetails(showId: string, season: number): Promise<EpisodeData[]>;
  getEpisodeDetails(showId: string, season: number, episode: number): Promise<EpisodeData | null>;
}
