import { SocialPost } from '@trenches/shared';

export interface ExtractedPhrase {
  key: string;
  label: string;
}

export interface PhraseExtractorOptions {
  minLength: number;
  maxLength: number;
  stopwords: Set<string>;
}

const MAX_NGRAM = 4;

export function extractPhrases(post: SocialPost, options: PhraseExtractorOptions): ExtractedPhrase[] {
  const stopwords = options.stopwords;
  const textParts: string[] = [];
  if (post.text) {
    textParts.push(post.text);
  }
  if (post.tags && post.tags.length > 0) {
    textParts.push(post.tags.join(' '));
  }
  if (post.topics && post.topics.length > 0) {
    textParts.push(post.topics.join(' '));
  }
  const unifiedText = textParts.join(' ');
  const tokens = tokenize(unifiedText);
  const phrases = new Map<string, ExtractedPhrase>();

  // single token candidates (tickers, hashtags, etc.)
  for (const token of tokens) {
    if (!token) continue;
    if (token.length < options.minLength || token.length > options.maxLength) {
      continue;
    }
    if (stopwords.has(token)) {
      continue;
    }
    const key = token;
    if (!phrases.has(key)) {
      phrases.set(key, { key, label: prettifyLabel(token) });
    }
  }

  // n-grams
  for (let n = 2; n <= MAX_NGRAM; n += 1) {
    for (let i = 0; i <= tokens.length - n; i += 1) {
      const slice = tokens.slice(i, i + n);
      if (slice.every((part) => stopwords.has(part))) {
        continue;
      }
      const phrase = slice.join(' ');
      if (phrase.length < options.minLength || phrase.length > options.maxLength) {
        continue;
      }
      if (!phrases.has(phrase)) {
        phrases.set(phrase, { key: phrase, label: prettifyLabel(phrase) });
      }
    }
  }

  // include uppercase tickers from raw text (e.g., $DJT)
  const tickerMatches = unifiedText.match(/\$?[A-Z0-9]{2,6}/g) ?? [];
  for (const raw of tickerMatches) {
    const cleaned = raw.replace(/^\$/g, '').toLowerCase();
    if (cleaned.length < options.minLength || cleaned.length > options.maxLength) {
      continue;
    }
    if (!cleaned) continue;
    if (!phrases.has(cleaned)) {
      phrases.set(cleaned, { key: cleaned, label: prettifyLabel(cleaned) });
    }
  }

  return Array.from(phrases.values());
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function prettifyLabel(phrase: string): string {
  return phrase
    .split(' ')
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}
