import { useEffect, useState } from 'react'
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
}

function App() {
  const [view, setView] = useState<'selected' | 'all'>('selected')
  const [articles, setArticles] = useState<Article[]>([])

  useEffect(() => {
    fetch(`/api/articles?view=${view}`)
      .then((response) => response.json())
      .then((data) => setArticles(data.articles))
      .catch((error) => console.error('Failed to load articles', error))
  }, [view])

  async function sendFeedback(articleId: string, rating: 'up' | 'down') {
    const article = articles.find((item) => item.id === articleId)
    const readDepth = article?.readDepth ?? 0

    await fetch(`/api/articles/${articleId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, readDepth }),
    })

    setArticles((items) =>
      items.map((item) => (item.id === articleId ? { ...item, rating } : item)),
    )
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

      <section className="toolbar" aria-label="Article view controls">
        <button className={view === 'selected' ? 'active' : ''} onClick={() => setView('selected')}>
          Selected
        </button>
        <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
          All
        </button>
      </section>

      <section className="article-list">
        {articles.map((article) => (
          <article className="article-card" key={article.id}>
            <div>
              <p className="source">{article.source}</p>
              <h2>{article.title}</h2>
              <p>{article.summary}</p>
            </div>
            <div className="article-actions">
              <a href={article.url} target="_blank" rel="noreferrer">
                Read
              </a>
              <button onClick={() => sendFeedback(article.id, 'up')} aria-pressed={article.rating === 'up'}>
                👍
              </button>
              <button onClick={() => sendFeedback(article.id, 'down')} aria-pressed={article.rating === 'down'}>
                👎
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
