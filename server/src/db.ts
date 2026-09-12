import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const databasePath = resolve(process.cwd(), process.env.DATABASE_PATH ?? '../data/manta.db');
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export type ArticleRow = {
  id: number;
  feed_id: number;
  url: string;
  title: string;
  summary: string | null;
  content: string | null;
  author: string | null;
  published_at: string | null;
  created_at: string;
  llm_score: number | null;
  llm_reason: string | null;
  is_selected: 0 | 1;
  feed_title: string | null;
  rating: 'up' | 'down' | null;
  read_depth: number | null;
};

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_refreshed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      author TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      llm_score REAL,
      llm_reason TEXT,
      is_selected INTEGER NOT NULL DEFAULT 0 CHECK (is_selected IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS article_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
      rating TEXT CHECK (rating IN ('up', 'down')),
      read_depth REAL NOT NULL DEFAULT 0 CHECK (read_depth >= 0 AND read_depth <= 1),
      opened_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function listArticles(view: 'selected' | 'all') {
  const where = view === 'selected' ? 'WHERE articles.is_selected = 1' : '';

  return db.prepare(`
    SELECT
      articles.*,
      feeds.title AS feed_title,
      article_feedback.rating,
      article_feedback.read_depth
    FROM articles
    JOIN feeds ON feeds.id = articles.feed_id
    LEFT JOIN article_feedback ON article_feedback.article_id = articles.id
    ${where}
    ORDER BY COALESCE(articles.published_at, articles.created_at) DESC
    LIMIT 100
  `).all() as ArticleRow[];
}

export function toApiArticle(row: ArticleRow) {
  return {
    id: String(row.id),
    title: row.title,
    source: row.feed_title ?? 'RSS feed',
    summary: row.summary ?? row.content ?? '',
    url: row.url,
    selected: row.is_selected === 1,
    readDepth: row.read_depth ?? 0,
    rating: row.rating,
    publishedAt: row.published_at,
    llmScore: row.llm_score,
    llmReason: row.llm_reason,
  };
}
