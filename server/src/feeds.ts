import Parser from 'rss-parser';
import { classifyPending } from './classifier.js';
import { db } from './db.js';

const parser = new Parser();

type FeedRow = {
  id: number;
  url: string;
  title: string | null;
  created_at: string;
  last_refreshed_at: string | null;
};

export function upsertFeed(url: string, title?: string) {
  const result = db.prepare(`
    INSERT INTO feeds (url, title)
    VALUES (@url, @title)
    ON CONFLICT(url) DO UPDATE SET title = COALESCE(excluded.title, feeds.title)
    RETURNING id, url, title, created_at, last_refreshed_at
  `).get({ url, title: title ?? null }) as FeedRow;

  return result;
}

export async function refreshFeed(feedId: number, classify = true) {
  const feed = db.prepare('SELECT id, url FROM feeds WHERE id = ?').get(feedId) as { id: number; url: string } | undefined;

  if (!feed) {
    return null;
  }

  const parsed = await parser.parseURL(feed.url);
  const feedTitle = parsed.title ?? null;

  db.prepare('UPDATE feeds SET title = COALESCE(?, title), last_refreshed_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    feedTitle,
    feed.id,
  );

  const insertArticle = db.prepare(`
    INSERT INTO articles (feed_id, url, title, summary, content, author, published_at, is_selected)
    VALUES (@feedId, @url, @title, @summary, @content, @author, @publishedAt, @isSelected)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title,
      summary = COALESCE(excluded.summary, articles.summary),
      content = COALESCE(excluded.content, articles.content),
      author = COALESCE(excluded.author, articles.author),
      published_at = COALESCE(excluded.published_at, articles.published_at)
  `);

  let insertedOrUpdated = 0;

  const ingest = db.transaction(() => {
    for (const item of parsed.items) {
      const url = item.link ?? item.guid;
      const title = item.title?.trim();

      if (!url || !title) {
        continue;
      }

      insertArticle.run({
        feedId: feed.id,
        url,
        title,
        summary: item.contentSnippet ?? item.summary ?? null,
        content: item.content ?? null,
        author: item.creator ?? item.author ?? null,
        publishedAt: item.isoDate ?? item.pubDate ?? null,
        isSelected: 0,
      });
      insertedOrUpdated += 1;
    }
  });

  ingest();

  const classifications = classify ? await classifyPending(20) : [];

  return {
    feedId: feed.id,
    title: feedTitle,
    itemCount: parsed.items.length,
    insertedOrUpdated,
    classified: classifications.length,
  };
}
