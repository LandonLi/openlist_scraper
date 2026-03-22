import { FetchClient } from '../utils/FetchClient';
import { IMetadataProvider, SearchResult, EpisodeData } from '../interfaces/IMetadataProvider';
import { ProxyHelper } from '../utils/ProxyHelper';
import type {
  MediaSearchMode,
  MediaType,
  MovieData,
  TmdbEpisodeItem,
  TmdbMovieItem,
  TmdbSearchResponse,
  TmdbSeasonResponse,
} from '../../shared/types';

export class TMDBProvider implements IMetadataProvider {
  name: string = 'TMDB';
  private apiKey: string;
  private api: FetchClient;
  private imageBaseUrl: string = 'https://image.tmdb.org/t/p/w500';
  private readonly fallbackLanguages = ['zh-CN', 'en-US'];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.api = FetchClient.create({
      baseURL: 'https://api.themoviedb.org/3',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      },
      params: {
        language: 'zh-CN', // Default to Chinese
      },
    });

    // Add request interceptor for logging
    // Add request interceptor for logging
    this.api.interceptors.request.use(config => {
      this.logDebug(`Request: ${config.method?.toUpperCase()} ${config.url}`, config.params);
      return config;
    });

    this.api.interceptors.response.use(response => {
      this.logDebug(`Response: ${response.status} ${response.config.url}`, { data: response.data });
      return response;
    }, error => {
      if (FetchClient.isFetchError(error)) {
        this.logDebug(`Response Error: ${error.message}`, error.response?.data);
      } else {
        this.logDebug('Response Error', error);
      }
      throw error;
    });
  }

  private debugLogger?: (msg: string) => void;

  setDebugLogger(logger: (message: string) => void) {
    this.debugLogger = logger;
  }

  setProxy(proxyUrl: string) {
    const proxyUrlStr = ProxyHelper.parseProxyUrl(proxyUrl);
    if (proxyUrlStr) {
      this.api.defaults.proxyUrl = proxyUrlStr;
      this.logDebug(`Proxy enabled: ${proxyUrlStr}`);
    } else {
      delete this.api.defaults.proxyUrl;
    }
  }

  private logDebug(msg: string, data?: unknown) {
    if (this.debugLogger) {
      const dataStr = data ? `\nData: ${JSON.stringify(data, null, 2)}` : '';
      this.debugLogger(`${msg}${dataStr}`);
    }
  }

  async search(query: string, mode: MediaSearchMode = 'auto'): Promise<SearchResult[]> {
    try {
      const seen = new Set<string>();
      const aggregatedResults: SearchResult[] = [];
      const mediaTypes: MediaType[] = mode === 'auto' ? ['tv', 'movie'] : [mode];

      for (const mediaType of mediaTypes) {
        for (const language of this.fallbackLanguages) {
          for (const candidate of this.buildSearchCandidates(query)) {
            const response = await this.api.get<TmdbSearchResponse>(`/search/${mediaType}`, {
              params: { query: candidate, language },
            });

            const results = response.data.results.map((item) => {
              const title = mediaType === 'movie' ? (item.title || '') : (item.name || '');
              const originalTitle = mediaType === 'movie'
                ? item.original_title
                : item.original_name;
              const yearSource = mediaType === 'movie'
                ? item.release_date
                : item.first_air_date;

              return {
                id: item.id.toString(),
                title,
                originalTitle,
                year: yearSource ? yearSource.substring(0, 4) : undefined,
                poster: item.poster_path ? `${this.imageBaseUrl}${item.poster_path}` : undefined,
                overview: item.overview,
                provider: 'tmdb',
                mediaType,
              };
            }).filter((item) => Boolean(item.title));

            for (const result of results) {
              const dedupeKey = `${result.mediaType}:${result.id}`;
              if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                aggregatedResults.push(result);
              }
            }

            if (aggregatedResults.length > 0) {
              return aggregatedResults;
            }
          }
        }
      }

      return [];
    } catch (error) {
      console.error('TMDB Search Error:', error);
      return [];
    }
  }

  private buildSearchCandidates(query: string): string[] {
    const trimmed = query.replace(/[-\s._]+$/, '').trim();
    const normalizedSeparators = trimmed.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
    const withoutYear = normalizedSeparators.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
    const candidates = [trimmed, normalizedSeparators, withoutYear]
      .map((item) => item.trim())
      .filter(Boolean);

    return Array.from(new Set(candidates));
  }

  async getSeasonDetails(showId: string, season: number): Promise<EpisodeData[]> {
    try {
      const response = await this.api.get<TmdbSeasonResponse>(`/tv/${showId}/season/${season}`);
      return response.data.episodes.map((data: TmdbEpisodeItem) => ({
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
      const response = await this.api.get<TmdbEpisodeItem>(`/tv/${showId}/season/${season}/episode/${episode}`, {
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
      // 404 is expected if episode doesn't exist
      if (FetchClient.isFetchError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('TMDB Episode Details Error:', error);
      return null;
    }
  }

  async getMovieDetails(movieId: string): Promise<MovieData | null> {
    try {
      for (const language of this.fallbackLanguages) {
        const response = await this.api.get<TmdbMovieItem>(`/movie/${movieId}`, {
          params: { language },
        });
        const movie = response.data;
        if (!movie?.id) continue;

        return {
          id: movie.id.toString(),
          title: movie.title,
          overview: movie.overview,
          releaseDate: movie.release_date,
          posterPath: movie.poster_path ? `${this.imageBaseUrl}${movie.poster_path}` : undefined,
          runtime: movie.runtime,
        };
      }
      return null;
    } catch (error) {
      if (FetchClient.isFetchError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('TMDB Movie Details Error:', error);
      return null;
    }
  }
}
