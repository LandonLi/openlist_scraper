import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { app } from 'electron';

export interface ScrapedMedia {
  id?: number;
  filePath: string;
  sourceId: string;
  seriesName: string;
  season: number;
  episode: number;
  tmdbId?: string;
  episodeTitle?: string;
  overview?: string;
  poster?: string;
  still?: string;
  airDate?: string;
  runtime?: number;
  scrapedAt: string;
}

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    // In production, store DB in userData directory
    const dbPath = path.join(app.getPath('userData'), 'media_scraper.db');
    fs.ensureDirSync(path.dirname(dbPath));
    
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scraped_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        source_id TEXT NOT NULL,
        series_name TEXT,
        season INTEGER,
        episode INTEGER,
        tmdb_id TEXT,
        episode_title TEXT,
        overview TEXT,
        poster TEXT,
        still TEXT,
        air_date TEXT,
        runtime INTEGER,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_id, file_path)
      );
    `);

    // Migration for existing databases
    const tableInfo = this.db.prepare("PRAGMA table_info(scraped_media)").all() as any[];
    const columns = tableInfo.map(c => c.name);
    
    if (!columns.includes('air_date')) {
      this.db.exec("ALTER TABLE scraped_media ADD COLUMN air_date TEXT");
    }
    if (!columns.includes('runtime')) {
      this.db.exec("ALTER TABLE scraped_media ADD COLUMN runtime INTEGER");
    }
  }

  saveMedia(media: Omit<ScrapedMedia, 'id' | 'scrapedAt'>) {
    const stmt = this.db.prepare(`
      INSERT INTO scraped_media (
        file_path, source_id, series_name, season, episode, 
        tmdb_id, episode_title, overview, poster, still, air_date, runtime
      ) VALUES (
        @filePath, @sourceId, @seriesName, @season, @episode,
        @tmdbId, @episodeTitle, @overview, @poster, @still, @airDate, @runtime
      )
      ON CONFLICT(source_id, file_path) DO UPDATE SET
        series_name = excluded.series_name,
        season = excluded.season,
        episode = excluded.episode,
        tmdb_id = excluded.tmdb_id,
        episode_title = excluded.episode_title,
        overview = excluded.overview,
        poster = excluded.poster,
        still = excluded.still,
        air_date = excluded.air_date,
        runtime = excluded.runtime,
        scraped_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(media);
  }

  getAllMedia(): ScrapedMedia[] {
    return this.db.prepare('SELECT * FROM scraped_media ORDER BY scraped_at DESC').all() as ScrapedMedia[];
  }
}
