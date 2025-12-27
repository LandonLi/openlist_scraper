import OpenAI from 'openai';
import { ILLMProvider, LLMConfig } from '../interfaces/ILLMProvider';

export class OpenAIClient implements ILLMProvider {
  name: string = 'OpenAI';
  private client: OpenAI | null = null;
  private model: string = 'gpt-3.5-turbo';

  configure(config: LLMConfig): void {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL, // Optional: supports generic OpenAI compatible endpoints
      dangerouslyAllowBrowser: false, // We are in Node.js main process
    });
    this.model = config.model || 'gpt-3.5-turbo';
  }

  async listModels(): Promise<string[]> {
    if (!this.client) throw new Error('OpenAI client not configured');
    try {
      const response = await this.client.models.list();
      return response.data.map(m => m.id);
    } catch (e: any) {
      throw new Error(`Failed to list models: ${e.message}`);
    }
  }

  async generateCompletion(prompt: string): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not configured');

    const completion = await this.client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: this.model,
    });

    return completion.choices[0]?.message?.content || '';
  }

  async generateJson<T>(prompt: string): Promise<T> {
    if (!this.client) throw new Error('OpenAI client not configured');

    const completion = await this.client.chat.completions.create({
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful assistant that extracts media information from filenames. Output strictly in JSON format.' 
        },
        { role: 'user', content: prompt }
      ],
      model: this.model,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(content) as T;
    } catch (e) {
      console.error('Failed to parse JSON from LLM:', content);
      throw new Error('Invalid JSON response from LLM');
    }
  }
}
