export interface MatchResult {
  success: boolean;
  seriesName?: string;
  season?: number;
  episode?: number;
  year?: string;
  confidence: number; // 0.0 - 1.0
  source: 'regex' | 'llm' | 'manual';
}

export interface IMatcher {
  match(filename: string): Promise<MatchResult>;
}
