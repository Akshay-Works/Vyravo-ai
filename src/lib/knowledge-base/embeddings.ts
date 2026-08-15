// Embedding Provider Layer
// Configurable: OpenAI | Cohere | Google | Local (Xenova transformers)
// Selected via EMBEDDING_PROVIDER env var. Never exposes keys to client.

export type EmbeddingProvider = "openai" | "cohere" | "google" | "local";

const OPENAI_MODEL = "text-embedding-3-small";
const OPENAI_DIMENSIONS = 1536;
const COHERE_MODEL = "embed-english-v3.0";
const COHERE_DIMENSIONS = 1024;
const GOOGLE_MODEL = "models/text-embedding-004";
const GOOGLE_DIMENSIONS = 768;
const LOCAL_DIMENSIONS = 384;

export function getEmbeddingProvider(): EmbeddingProvider {
  const env = process.env.EMBEDDING_PROVIDER as EmbeddingProvider | undefined;
  return env || "local";
}

export function getEmbeddingDimensions(): number {
  switch (getEmbeddingProvider()) {
    case "openai": return OPENAI_DIMENSIONS;
    case "cohere": return COHERE_DIMENSIONS;
    case "google": return GOOGLE_DIMENSIONS;
    case "local": default: return LOCAL_DIMENSIONS;
  }
}

export function getEmbeddingModelName(): string {
  switch (getEmbeddingProvider()) {
    case "openai": return OPENAI_MODEL;
    case "cohere": return COHERE_MODEL;
    case "google": return GOOGLE_MODEL;
    case "local": default: return "Xenova/all-MiniLM-L6-v2";
  }
}

/** Reject after ms if the promise hasn't settled — embeddings must never hang a request. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Embedding timeout after ${ms}ms (${label})`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export function isEmbeddingConfigured(): boolean {
  const provider = getEmbeddingProvider();
  switch (provider) {
    case "openai": return Boolean(process.env.OPENAI_API_KEY);
    case "cohere": return Boolean(process.env.COHERE_API_KEY);
    case "google": return Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
    case "local": return true; // bundled model, no key needed
  }
}

interface EmbeddingError extends Error {
  status?: number;
}

/**
 * Embed a single text string.
 * @param text Text to embed
 * @returns Float array of embedding vector
 */
export async function embedText(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  switch (provider) {
    case "openai": return withTimeout(embedWithOpenAI(text), 15_000, "openai");
    case "cohere": return withTimeout(embedWithCohere(text), 15_000, "cohere");
    case "google": return withTimeout(embedWithGoogle(text), 15_000, "google");
    case "local": default: return withTimeout(embedWithLocal(text), 20_000, "local");
  }
}

/** Embed multiple texts in one batch (where the provider supports it). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return withTimeout(embedTextsInner(texts), 30_000, "batch");
}

async function embedTextsInner(texts: string[]): Promise<number[][]> {
  // Batch per provider
  const provider = getEmbeddingProvider();
  if (provider === "openai") return embedBatchOpenAI(texts);
  if (provider === "cohere") return embedBatchCohere(texts);
  if (provider === "google") {
    const results: number[][] = [];
    for (const t of texts) results.push(await embedWithGoogle(t));
    return results;
  }
  // local
  const results: number[][] = [];
  for (const t of texts) results.push(await embedWithLocal(t));
  return results;
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------
async function embedWithOpenAI(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OPENAI_MODEL, input: text }),
  });
  if (!res.ok) {
    const err: EmbeddingError = new Error(`OpenAI embedding error: ${res.status} ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.data[0].embedding;
}

async function embedBatchOpenAI(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const results: number[][] = [];
  // OpenAI has a 2048-input limit per request; chunk batches of 100
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: OPENAI_MODEL, input: batch }),
    });
    if (!res.ok) throw new Error(`OpenAI embedding error: ${res.status}`);
    const data = await res.json();
    const sorted = [...data.data].sort((a: any, b: any) => a.index - b.index);
    results.push(...sorted.map((d: any) => d.embedding));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Cohere
// ---------------------------------------------------------------------------
async function embedWithCohere(text: string): Promise<number[]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY not configured");
  const res = await fetch("https://api.cohere.ai/v2/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: COHERE_MODEL, texts: [text], input_type: "search_document" }),
  });
  if (!res.ok) throw new Error(`Cohere embedding error: ${res.status}`);
  const data = await res.json();
  return data.embeddings[0];
}

async function embedBatchCohere(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY not configured");
  const res = await fetch("https://api.cohere.ai/v2/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: COHERE_MODEL, texts, input_type: "search_document" }),
  });
  if (!res.ok) throw new Error(`Cohere embedding error: ${res.status}`);
  const data = await res.json();
  return data.embeddings;
}

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------
async function embedWithGoogle(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${GOOGLE_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: GOOGLE_MODEL, content: { parts: [{ text }] } }),
    }
  );
  if (!res.ok) throw new Error(`Google embedding error: ${res.status}`);
  const data = await res.json();
  return data.embedding.values;
}

// ---------------------------------------------------------------------------
// Local — Xenova transformers (bundled, no API key)
// ---------------------------------------------------------------------------
let localPipelinePromise: Promise<any> | null = null;

function getLocalPipeline(): Promise<any> {
  if (!localPipelinePromise) {
    localPipelinePromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return withTimeout(
        pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2"),
        30_000,
        "local model load"
      );
    })();
  }
  return localPipelinePromise;
}

async function embedWithLocal(text: string): Promise<number[]> {
  const pipe = await getLocalPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}
