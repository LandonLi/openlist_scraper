import axios, { AxiosInstance } from 'axios';
import { IMetadataProvider, SearchResult, EpisodeData } from '../interfaces/IMetadataProvider';

export class TMDBProvider implements IMetadataProvider {
  name: string = 'TMDB';
  private apiKey: string;
  private api: AxiosInstance;
  private imageBaseUrl: string = 'https://image.tmdb.org/t/p/w500';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.api = axios.create({
      baseURL: 'https://api.themoviedb.org/3',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      },
      params: {
        language: 'zh-CN', // Default to Chinese
      },
    });
  }

  async searchTVShow(query: string): Promise<SearchResult[]> {
    try {
      // Clean query: remove trailing hyphens and extra spaces
      const cleanQuery = query.replace(/[-\s]+$/, '').trim();
      
      const response = await this.api.get('/search/tv', {
        params: { query: cleanQuery },
      });

      return response.data.results.map((item: any) => ({
        id: item.id.toString(),
        title: item.name,
        originalTitle: item.original_name,
        year: item.first_air_date ? item.first_air_date.substring(0, 4) : undefined,
        poster: item.poster_path ? `${this.imageBaseUrl}${item.poster_path}` : undefined,
        overview: item.overview,
        provider: 'tmdb',
      }));
    } catch (error) {
      console.error('TMDB Search Error:', error);
      return [];
    }
  }

  async getSeasonDetails(showId: string, season: number): Promise<EpisodeData[]> {
    try {
      const response = await this.api.get(`/tv/${showId}/season/${season}`);
      return response.data.episodes.map((data: any) => ({
        id: data.id.toString(),
        seasonNumber: data.season_number,
        episodeNumber: data.episode_number,
        title: data.name,
        overview: data.overview,
        airDate: data.air_date,
        stillPath: data.still_path ? `${this.imageBaseUrl}${data.still_path}` : undefined,
        runtime: data.runtime,
      }));
    } catch (error) {
      console.error('TMDB Season Details Error:', error);
      return [];
    }
  }

  async getEpisodeDetails(showId: string, season: number, episode: number): Promise<EpisodeData | null> {
    try {
      const response = await this.api.get(`/tv/${showId}/season/${season}/episode/${episode}`, {
          params: {
              append_to_response: 'credits,images' // Optional: add more details for the "detailed view"
          }
      });
      const data = response.data;

      return {
        id: data.id.toString(),
        seasonNumber: data.season_number,
        episodeNumber: data.episode_number,
        title: data.name,
        overview: data.overview,
        airDate: data.air_date,
        stillPath: data.still_path ? `${this.imageBaseUrl}${data.still_path}` : undefined,
        runtime: data.runtime,
      };
    } catch (error) {
      // 404 is expected if episode doesn't exist
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('TMDB Episode Details Error:', error);
      return null;
    }
  }
}
