import { IMatcher, MatchResult } from '../interfaces/IMatcher';
import { ILLMProvider } from '../interfaces/ILLMProvider';
import path from 'path';

export class LLMEngine implements IMatcher {
  private llm: ILLMProvider;

  constructor(llmProvider: ILLMProvider) {
    this.llm = llmProvider;
  }

  async matchEpisodeFromList(filename: string, episodeList: any[]): Promise<number | null> {
    const listStr = episodeList.map(e => `E${e.episodeNumber}: ${e.title} (${e.overview?.substring(0, 50)}...)`).join('\n');
    
    const prompt = `
      Match the following filename to the most likely episode from the provided list.
      Filename: "${filename}"
      
      Episode List:
      ${listStr}
      
      Return a JSON object with:
      - episodeNumber: number (The number of the matching episode, or null if no confident match)
      - reason: string (Briefly why it matches)
    `;

    console.log(`[LLM-Fuzzy] Sending prompt:\n${prompt}`);

    try {
      const result = await this.llm.generateJson<{ episodeNumber?: number, reason?: string }>(prompt);
      console.log(`[LLM-Fuzzy] Result:`, result);
      return result.episodeNumber ?? null;
    } catch (e) {
      console.error('LLM List Match Error:', e);
      return null;
    }
  }

  async resolveDirectory(dirPath: string, filenames: string[]): Promise<{ seriesName?: string, season?: number, matches: Array<{ filename: string, episode: number }> }> {
    const prompt = `
      Analyze the following directory path and its video files to identify the TV series and match each file to an episode number.
      
      Directory Path: "${dirPath}"
      Files:
      ${filenames.map(f => `- ${f}`).join('\n')}
      
      Return a JSON object with this exact structure:
      {
        "seriesName": "Name of the show",
        "season": number (Season number. If specials, use 0. If unknown, use 1.),
        "matches": [
          { "filename": "example.mp4", "episode": number }
        ]
      }
    `;

    try {
      const result = await this.llm.generateJson<{
        seriesName?: string;
        season?: number;
        matches: Array<{ filename: string, episode: number }>;
      }>(prompt);
      return result;
    } catch (e) {
      console.error('LLM Directory Resolve Error:', e);
      return { matches: [] };
    }
  }

  async match(filename: string): Promise<MatchResult> {
    const cleanName = path.basename(filename);
    
    const prompt = `
      Analyze the following filename and extract metadata.
      Filename: "${cleanName}"
      
      Return a JSON object with these keys:
      - seriesName: string (The title of the show or movie)
      - season: number (The season number. If it is a "Special", "OVA", "SP", or "特别篇", set season to 0. Default to 1 if finding an episode but no season. Null if movie.)
      - episode: number (The episode number. For specials, try to find the episode number within the specials season if possible.)
      - year: string (The release year if found)
      - type: "movie" | "tv"
      
      If you cannot determine the series name, return { "error": "unknown" }.
    `;

    try {
      const result = await this.llm.generateJson<{
        seriesName?: string;
        season?: number;
        episode?: number;
        year?: string;
        type?: string;
        error?: string;
      }>(prompt);

      if (result.error || !result.seriesName) {
        return {
          success: false,
          confidence: 0,
          source: 'llm'
        };
      }

      return {
        success: true,
        seriesName: result.seriesName,
        season: result.season,
        episode: result.episode,
        year: result.year,
        confidence: 0.8, // LLM results are less certain than regex
        source: 'llm'
      };

    } catch (error) {
      console.error('LLM Match Error:', error);
      return {
        success: false,
        confidence: 0,
        source: 'llm'
      };
    }
  }
}
