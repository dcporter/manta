import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { db, listArticles, migrate, toApiArticle } from './db.js';
import { refreshFeed, upsertFeed } from './feeds.js';

dotenv.config({ path: '../.env' });
dotenv.config();

migrate();

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'manta' });
});

app.get('/api/feeds', (_req, res) => {
  const feeds = db.prepare(`
    SELECT id, url, title, created_at, last_refreshed_at
    FROM feeds
    ORDER BY created_at DESC
  `).all();

  res.json({ feeds });
});

app.post('/api/feeds', async (req, res, next) => {
  try {
    const { url, refresh = true } = req.body as { url?: string; refresh?: boolean };

    if (!url) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    const feed = upsertFeed(url);
    const refreshResult = refresh ? await refreshFeed(Number(feed.id)) : null;

    res.status(201).json({ feed, refresh: refreshResult });
  } catch (error) {
    next(error);
  }
});

app.post('/api/feeds/:id/refresh', async (req, res, next) => {
  try {
    const result = await refreshFeed(Number(req.params.id));

    if (!result) {
      res.status(404).json({ error: 'feed not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/articles', (req, res) => {
  const view = req.query.view === 'all' ? 'all' : 'selected';
  const articles = listArticles(view).map(toApiArticle);

  res.json({ view, articles });
});

app.post('/api/articles/:id/feedback', (req, res) => {
  const articleId = Number(req.params.id);
  const { rating, readDepth = 0 } = req.body as { rating?: 'up' | 'down'; readDepth?: number };

  if (!Number.isInteger(articleId)) {
    res.status(400).json({ error: 'invalid article id' });
    return;
  }

  if (rating !== undefined && rating !== 'up' && rating !== 'down') {
    res.status(400).json({ error: 'rating must be up or down' });
    return;
  }

  const boundedReadDepth = Math.max(0, Math.min(1, Number(readDepth) || 0));

  db.prepare(`
    INSERT INTO article_feedback (article_id, rating, read_depth, opened_at, updated_at)
    VALUES (@articleId, @rating, @readDepth, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(article_id) DO UPDATE SET
      rating = excluded.rating,
      read_depth = MAX(article_feedback.read_depth, excluded.read_depth),
      updated_at = CURRENT_TIMESTAMP
  `).run({ articleId, rating: rating ?? null, readDepth: boundedReadDepth });

  res.json({ ok: true, articleId: String(articleId), feedback: { rating, readDepth: boundedReadDepth } });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : 'unknown server error' });
});

app.listen(port, () => {
  console.log(`Manta server listening on http://localhost:${port}`);
});
