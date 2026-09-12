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

## Initial product shape

- Selected article view
- All article view
- Thumbs up/down feedback
- Reading-depth tracking signal
- RSS ingestion
- LLM-based article filtering
