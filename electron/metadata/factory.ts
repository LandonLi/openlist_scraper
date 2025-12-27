import { IMetadataProvider } from '../interfaces/IMetadataProvider';
import { TMDBProvider } from './TMDBProvider';

export type MetadataSourceType = 'tmdb';

export class MetadataFactory {
  static create(type: MetadataSourceType, config: { apiKey: string }): IMetadataProvider {
    switch (type) {
      case 'tmdb':
        return new TMDBProvider(config.apiKey);
      default:
        throw new Error(`Unknown metadata source type: ${type}`);
    }
  }
}
