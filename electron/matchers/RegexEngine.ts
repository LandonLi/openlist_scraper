import { IMatcher, MatchResult } from '../interfaces/IMatcher';
import fs from 'fs-extra';
import path from 'path';

interface RegexRule {
  id: string;
  pattern: string;
  type: string;
}

export class RegexEngine implements IMatcher {
  private rules: RegexRule[] = [];

  constructor(defaultRulesPath: string, customRulesPath?: string) {
    this.loadRules(defaultRulesPath, customRulesPath);
  }

  private async loadRules(defaultRulesPath: string, customRulesPath?: string) {
    // 1. Load built-in rules
    if (await fs.pathExists(defaultRulesPath)) {
      const defaultRules = await fs.readJSON(defaultRulesPath);
      this.rules.push(...defaultRules);
    } else {
      console.warn('Default rules not found at:', defaultRulesPath);
    }

    // 2. Load user custom rules if provided
    if (customRulesPath && await fs.pathExists(customRulesPath)) {
      const customRules = await fs.readJSON(customRulesPath);
      this.rules.unshift(...customRules); // Custom rules take precedence
    }
  }

  async match(filename: string): Promise<MatchResult> {
    const cleanName = path.basename(filename, path.extname(filename));

    for (const rule of this.rules) {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        const match = regex.exec(cleanName);

        if (match && match.groups) {
          const { title, season, episode, year } = match.groups;

          // Basic validation: Must have at least a title
          if (!title) continue;

          return {
            success: true,
            seriesName: title.trim(),
            season: season ? parseInt(season, 10) : 1, // Default to Season 1
            episode: episode ? parseInt(episode, 10) : undefined,
            year: year,
            confidence: 1.0, // Regex matches are considered high confidence if they hit
            source: 'regex'
          };
        }
      } catch (e) {
        console.error(`Error executing regex rule ${rule.id}:`, e);
      }
    }

    return {
      success: false,
      confidence: 0,
      source: 'regex'
    };
  }
}
