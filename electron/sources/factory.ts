import { IMediaSource } from '../interfaces/IMediaSource';
import { LocalSource } from './LocalSource';
import { OpenListSource } from './OpenListSource';

export type SourceType = 'local' | 'openlist';

export class SourceFactory {
  static create(type: SourceType, id: string, name: string): IMediaSource {
    switch (type) {
      case 'local':
        return new LocalSource(id, name);
      case 'openlist':
        return new OpenListSource(id, name);
      default:
        throw new Error(`Unknown source type: ${type}`);
    }
  }
}
