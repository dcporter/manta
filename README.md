# Manta

Manta is a local web app for filtering article feeds. It will ingest RSS feeds, use an LLM to select promising articles, and learn from explicit feedback plus reading-depth signals.

## Stack

- React + Vite web UI in `web/`
- Node + Express API in `server/`
- Planned local SQLite storage in `data/`
- OpenAI API initially for article filtering/classification

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

The web app runs on Vite and proxies `/api` requests to the server on port `3001`.

## API currently scaffolded

- `GET /api/health`
- `GET /api/feeds`
- `POST /api/feeds` with `{ "url": "https://...", "refresh": true }`
- `POST /api/feeds/:id/refresh`
- `GET /api/articles?view=selected|all`
- `POST /api/articles/:id/feedback` with `{ "rating": "up" | "down", "readDepth": 0.0 }`

## Storage

SQLite is initialized automatically at `DATABASE_PATH` when the server starts. Current tables:

- `feeds`
- `articles`
- `article_feedback`

## Initial product shape

- Selected article view
- All article view
- Thumbs up/down feedback
- Reading-depth tracking signal
- RSS ingestion
- LLM-based article filtering
