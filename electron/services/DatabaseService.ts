import path from 'path';
import fs from 'fs-extra';
import { app } from 'electron';
import { createRequire } from 'module';

type BetterSqliteDatabase = import('better-sqlite3').Database;
type BetterSqliteConstructor = new (
  filename: string,
  options?: Record<string, unknown>,
) => BetterSqliteDatabase;

const require = createRequire(import.meta.url);
const BETTER_SQLITE_NATIVE_ERROR_PATTERNS = [
  /Could not locate the bindings file/i,
  /was compiled against a different Node\.js version/i,
  /NODE_MODULE_VERSION/i,
];

export class NativeDependencyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'NativeDependencyError';

    if (options && 'cause' in options) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function normalizeBetterSqliteError(error: unknown): Error {
  if (error instanceof NativeDependencyError) {
    return error;
  }

  const originalMessage = error instanceof Error ? error.message : String(error);
  const isNativeDependencyFailure = BETTER_SQLITE_NATIVE_ERROR_PATTERNS.some((pattern) =>
    pattern.test(originalMessage),
  );

  if (!isNativeDependencyFailure) {
    return error instanceof Error ? error : new Error(originalMessage);
  }

  const recoveryMessage = [
    'better-sqlite3 的 Electron 原生依赖未就绪，应用无法初始化本地缓存数据库。',
    '请在仓库根目录执行 `pnpm run rebuild:native`（或 `npm run rebuild:native`），完成后重新启动开发环境。',
    '',
    `原始错误：${originalMessage}`,
  ].join('\n');

  return new NativeDependencyError(recoveryMessage, { cause: error });
}

function loadBetterSqlite(): BetterSqliteConstructor {
  try {
    const loaded = require('better-sqlite3') as
      | BetterSqliteConstructor
      | { default: BetterSqliteConstructor };

    return typeof loaded === 'function' ? loaded : loaded.default;
  } catch (error) {
    throw normalizeBetterSqliteError(error);
  }
}

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

interface TableInfoRow {
  name: string;
}

export class DatabaseService {
  private db: BetterSqliteDatabase;

  constructor() {
    // In production, store DB in userData directory
    const dbPath = path.join(app.getPath('userData'), 'media_scraper.db');
    fs.ensureDirSync(path.dirname(dbPath));

    // Delay native module loading so we can surface an actionable recovery step.
    const Database = loadBetterSqlite();

    try {
      this.db = new Database(dbPath);
    } catch (error) {
      throw normalizeBetterSqliteError(error);
    }

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
    const tableInfo = this.db.prepare("PRAGMA table_info(scraped_media)").all() as TableInfoRow[];
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
