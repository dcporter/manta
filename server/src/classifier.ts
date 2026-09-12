import OpenAI from 'openai';
import { db, type ArticleRow } from './db.js';

const defaultFilterPrompt =
  'Select articles that are likely to be useful, surprising, technically substantive, or worth reading deeply. Reject obvious spam, shallow promos, and low-signal listicles.';

type Classification = {
  score: number;
  selected: boolean;
  reason: string;
};

function fallbackClassify(article: Pick<ArticleRow, 'title' | 'summary' | 'content'>): Classification {
  const text = `${article.title} ${article.summary ?? ''} ${article.content ?? ''}`.toLowerCase();
  const positiveSignals = ['deep', 'research', 'analysis', 'guide', 'explains', 'technical', 'study', 'released'];
  const negativeSignals = ['sponsored', 'deal', 'coupon', 'sale', 'promo'];

  const score = Math.max(
    0,
    Math.min(
      1,
      0.55 + positiveSignals.filter((word) => text.includes(word)).length * 0.08 - negativeSignals.filter((word) => text.includes(word)).length * 0.18,
    ),
  );

  return {
    score,
    selected: score >= 0.5,
    reason: 'Heuristic fallback classification; set OPENAI_API_KEY for LLM filtering.',
  };
}

async function llmClassify(article: Pick<ArticleRow, 'title' | 'summary' | 'content' | 'url'>): Promise<Classification> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return fallbackClassify(article);
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const filterPrompt = process.env.MANTA_FILTER_PROMPT ?? defaultFilterPrompt;

  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'system',
        content:
          'You filter RSS articles for a personal reading queue. Return only valid JSON with score, selected, and reason.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          filterPrompt,
          article: {
            title: article.title,
            url: article.url,
            summary: article.summary,
            contentPreview: article.content?.slice(0, 2500) ?? null,
          },
          instructions: {
            score: 'number from 0 to 1 where 1 is most worth reading',
            selected: 'true if this belongs in the selected queue',
            reason: 'short explanation, max 160 chars',
          },
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'article_classification',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            score: { type: 'number', minimum: 0, maximum: 1 },
            selected: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['score', 'selected', 'reason'],
        },
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as Classification;
  return {
    score: Math.max(0, Math.min(1, parsed.score)),
    selected: parsed.selected,
    reason: parsed.reason.slice(0, 500),
  };
}

export async function classifyArticle(articleId: number) {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as ArticleRow | undefined;

  if (!article) {
    return null;
  }

  const classification = await llmClassify(article);

  db.prepare(`
    UPDATE articles
    SET llm_score = @score,
        llm_reason = @reason,
        is_selected = @isSelected
    WHERE id = @articleId
  `).run({
    articleId,
    score: classification.score,
    reason: classification.reason,
    isSelected: classification.selected ? 1 : 0,
  });

  return { articleId, ...classification };
}

export async function classifyPending(limit = 20) {
  const rows = db.prepare(`
    SELECT * FROM articles
    WHERE llm_score IS NULL
    ORDER BY COALESCE(published_at, created_at) DESC
    LIMIT ?
  `).all(limit) as ArticleRow[];

  const results = [];
  for (const row of rows) {
    results.push(await classifyArticle(row.id));
  }

  return results.filter(Boolean);
}
