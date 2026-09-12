import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'manta' });
});

app.get('/api/articles', (req, res) => {
  const view = req.query.view === 'all' ? 'all' : 'selected';

  res.json({
    view,
    articles: [
      {
        id: 'demo-1',
        title: 'Welcome to Manta',
        source: 'Local demo',
        summary: 'Manta will ingest RSS feeds, use an LLM to select likely-interesting articles, and learn from your feedback.',
        url: 'https://example.com',
        selected: true,
        readDepth: 0,
        rating: null,
      },
    ],
  });
});

app.post('/api/articles/:id/feedback', (req, res) => {
  const { id } = req.params;
  const { rating, readDepth } = req.body as { rating?: 'up' | 'down'; readDepth?: number };

  res.json({ ok: true, articleId: id, feedback: { rating, readDepth } });
});

app.listen(port, () => {
  console.log(`Manta server listening on http://localhost:${port}`);
});
