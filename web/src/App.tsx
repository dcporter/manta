import { useEffect, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'
import './App.css'

type Article = {
  id: string
  title: string
  source: string
  summary: string
  url: string
  selected: boolean
  readDepth: number
  rating: 'up' | 'down' | null
  publishedAt: string | null
  llmScore: number | null
  llmReason: string | null
}

type Feed = {
  id: number
  url: string
  title: string | null
  created_at: string
  last_refreshed_at: string | null
}

function textFromHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function App() {
  const [view, setView] = useState<'selected' | 'all'>('selected')
  const [articles, setArticles] = useState<Article[]>([])
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [feedUrl, setFeedUrl] = useState('')
  const [status, setStatus] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [readerArticle, setReaderArticle] = useState<Article | null>(null)

  async function loadArticles(nextView = view) {
    const response = await fetch(`/api/articles?view=${nextView}`)
    const data = await response.json()
    setArticles(data.articles)
  }

  async function loadFeeds() {
    const response = await fetch('/api/feeds')
    const data = await response.json()
    setFeeds(data.feeds)
  }

  useEffect(() => {
    loadArticles().catch((error) => console.error('Failed to load articles', error))
  }, [view])

  useEffect(() => {
    loadFeeds().catch((error) => console.error('Failed to load feeds', error))
  }, [])

  async function addFeed(event: FormEvent) {
    event.preventDefault()
    if (!feedUrl.trim()) return

    setIsBusy(true)
    setStatus('Adding feed and filtering recent articles…')

    try {
      const response = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: feedUrl.trim(), refresh: true, classify: true }),
      })

      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()

      setFeedUrl('')
      setStatus(`Added feed. Ingested ${data.refresh?.insertedOrUpdated ?? 0} items; classified ${data.refresh?.classified ?? 0}.`)
      await Promise.all([loadFeeds(), loadArticles()])
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to add feed')
    } finally {
      setIsBusy(false)
    }
  }

  async function refreshFeed(feedId: number) {
    setIsBusy(true)
    setStatus('Refreshing feed and filtering articles…')

    try {
      const response = await fetch(`/api/feeds/${feedId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classify: true }),
      })

      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()

      setStatus(`Refreshed feed. Ingested ${data.insertedOrUpdated} items; classified ${data.classified}.`)
      await Promise.all([loadFeeds(), loadArticles()])
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to refresh feed')
    } finally {
      setIsBusy(false)
    }
  }

  async function updateFeedback(articleId: string, feedback: { rating?: 'up' | 'down'; readDepth?: number }) {
    await fetch(`/api/articles/${articleId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    })

    setArticles((items) =>
      items.map((item) =>
        item.id === articleId
          ? {
              ...item,
              rating: feedback.rating ?? item.rating,
              readDepth: Math.max(item.readDepth, feedback.readDepth ?? item.readDepth),
            }
          : item,
      ),
    )
    setReaderArticle((item) =>
      item?.id === articleId
        ? {
            ...item,
            rating: feedback.rating ?? item.rating,
            readDepth: Math.max(item.readDepth, feedback.readDepth ?? item.readDepth),
          }
        : item,
    )
  }

  async function openReader(articleId: string) {
    const response = await fetch(`/api/articles/${articleId}`)
    if (!response.ok) throw new Error(await response.text())
    const data = await response.json()
    setReaderArticle(data.article)
    await updateFeedback(articleId, { readDepth: data.article.readDepth ?? 0 })
  }

  function trackReadingDepth(event: UIEvent<HTMLElement>) {
    if (!readerArticle) return

    const element = event.currentTarget
    const scrollable = element.scrollHeight - element.clientHeight
    const readDepth = scrollable <= 0 ? 1 : Math.min(1, element.scrollTop / scrollable)
    const rounded = Math.round(readDepth * 20) / 20

    if (rounded > readerArticle.readDepth) {
      updateFeedback(readerArticle.id, { readDepth: rounded }).catch((error) =>
        console.error('Failed to update read depth', error),
      )
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Manta</p>
        <h1>Your feed, filter-fed by an LLM.</h1>
        <p>
          Collect RSS articles, surface likely-good reads, and learn from thumbs
          and reading-depth signals.
        </p>
      </header>

      <section className="panel">
        <h2>Add a feed</h2>
        <form className="feed-form" onSubmit={addFeed}>
          <input
            type="url"
            placeholder="https://example.com/rss.xml"
            value={feedUrl}
            onChange={(event) => setFeedUrl(event.target.value)}
            disabled={isBusy}
          />
          <button disabled={isBusy}>{isBusy ? 'Working…' : 'Add feed'}</button>
        </form>
        {status && <p className="status">{status}</p>}
        <div className="feed-list">
          {feeds.map((feed) => (
            <div className="feed-row" key={feed.id}>
              <span>{feed.title ?? feed.url}</span>
              <button disabled={isBusy} onClick={() => refreshFeed(feed.id)}>
                Refresh
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="toolbar" aria-label="Article view controls">
        <button className={view === 'selected' ? 'active' : ''} onClick={() => setView('selected')}>
          Selected
        </button>
        <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
          All
        </button>
      </section>

      <section className="article-list">
        {articles.length === 0 && <p className="empty">No articles yet. Add an RSS feed to get started.</p>}
        {articles.map((article) => (
          <article className="article-card" key={article.id}>
            <div>
              <p className="source">{article.source}</p>
              <h2>{article.title}</h2>
              <p>{textFromHtml(article.summary)}</p>
              {article.llmReason && (
                <p className="reason">
                  Score {article.llmScore?.toFixed(2)} · {article.llmReason}
                </p>
              )}
              {article.readDepth > 0 && <p className="reason">Read depth: {Math.round(article.readDepth * 100)}%</p>}
            </div>
            <div className="article-actions">
              <button onClick={() => openReader(article.id)}>Open reader</button>
              <a href={article.url} target="_blank" rel="noreferrer">
                Source
              </a>
              <button onClick={() => updateFeedback(article.id, { rating: 'up', readDepth: article.readDepth })} aria-pressed={article.rating === 'up'}>
                👍
              </button>
              <button onClick={() => updateFeedback(article.id, { rating: 'down', readDepth: article.readDepth })} aria-pressed={article.rating === 'down'}>
                👎
              </button>
            </div>
          </article>
        ))}
      </section>

      {readerArticle && (
        <div className="reader-backdrop" role="dialog" aria-modal="true" aria-label={readerArticle.title}>
          <article className="reader-panel">
            <header className="reader-header">
              <div>
                <p className="source">{readerArticle.source}</p>
                <h2>{readerArticle.title}</h2>
                <p className="reason">Read depth: {Math.round(readerArticle.readDepth * 100)}%</p>
              </div>
              <button onClick={() => setReaderArticle(null)}>Close</button>
            </header>
            <div className="reader-body" onScroll={trackReadingDepth}>
              <p>{textFromHtml(readerArticle.summary) || 'No embedded article content was available from this feed item.'}</p>
              <p>
                <a href={readerArticle.url} target="_blank" rel="noreferrer">
                  Continue at source
                </a>
              </p>
            </div>
            <footer className="article-actions reader-actions">
              <button onClick={() => updateFeedback(readerArticle.id, { rating: 'up', readDepth: readerArticle.readDepth })} aria-pressed={readerArticle.rating === 'up'}>
                👍 Useful
              </button>
              <button onClick={() => updateFeedback(readerArticle.id, { rating: 'down', readDepth: readerArticle.readDepth })} aria-pressed={readerArticle.rating === 'down'}>
                👎 Not useful
              </button>
            </footer>
          </article>
        </div>
      )}
    </main>
  )
}

export default App
