import type { MatchResult } from '../../shared/types';

export type { MatchResult };

export interface IMatcher {
  match(filename: string): Promise<MatchResult>;
}
