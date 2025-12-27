export interface LLMConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
}

export interface ILLMProvider {
  name: string;
  configure(config: LLMConfig): void;
  generateCompletion(prompt: string): Promise<string>;
  generateJson<T>(prompt: string): Promise<T>;
}
