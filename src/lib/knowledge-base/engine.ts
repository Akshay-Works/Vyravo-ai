// Knowledge Base Engine
// RAG pipeline: document processing, hybrid search, AI assistant with
// citations, knowledge gap detection, and analytics logging.
//
// All tables reused here already exist in the database (see
// src/db/knowledge-schema.ts for the 1:1 mapping). Only kb_knowledge_gaps
// and kb_queries are created by the setup script.

import { eq, and, sql, ilike, or, count, ne, inArray } from "drizzle-orm";
import { createHash } from "crypto";
import { pool, db } from "@/db";
import {
  kbDocuments,
  kbChunks,
  kbDocumentVersions,
  kbDocumentBlobs,
  kbEmbeddings,
  kbKnowledgeGaps,
  kbQueries,
  kbCategories,
  kbAuditLogs,
} from "@/db/knowledge-schema";
import { extractTextFromBuffer } from "./extractor";
import { chunkText } from "./chunker";
import {
  getEmbeddingModelName,
  getEmbeddingDimensions,
  isEmbeddingConfigured,
} from "./embeddings";
import { ensureVectorInfrastructure, storeEmbeddings, searchVectors, deleteEmbeddingsForDocument } from "./vector-store";
import type {
  DocumentStatus,
  AccessLevel,
  KBSearchOptions,
  KBSearchResult,
  KBAskResult,
} from "./types";

// ---------------------------------------------------------------------------
// Lazy schema bootstrap — the existing KB tables are reused as-is; this only
// applies the additive `doc_type` column and creates the two NEW tables.
// ---------------------------------------------------------------------------
let tablesEnsured: Promise<void> | null = null;

export function ensureKbTables(): Promise<void> {
  if (!tablesEnsured) {
    tablesEnsured = (async () => {
      try {
        await pool.query(
          `ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50) DEFAULT 'document'`
        );
        await pool.query(
          `ALTER TABLE kb_embeddings ADD COLUMN IF NOT EXISTS embedding_json JSONB`
        );
        await pool.query(`CREATE TABLE IF NOT EXISTS kb_knowledge_gaps (
          id SERIAL PRIMARY KEY,
          question TEXT NOT NULL,
          frequency INTEGER DEFAULT 1,
          category TEXT,
          source VARCHAR(50),
          status VARCHAR(30) DEFAULT 'open',
          suggested_action TEXT,
          resolved_by_document_id INTEGER,
          resolved_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT now() NOT NULL,
          updated_at TIMESTAMP DEFAULT now() NOT NULL
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS kb_queries (
          id SERIAL PRIMARY KEY,
          query TEXT NOT NULL,
          query_type VARCHAR(20) NOT NULL,
          results_count INTEGER DEFAULT 0,
          confidence DECIMAL(5,4),
          answered BOOLEAN DEFAULT false,
          answer_satisfactory BOOLEAN,
          gap_created BOOLEAN DEFAULT false,
          source_documents JSONB,
          metadata JSONB,
          session_id TEXT,
          created_at TIMESTAMP DEFAULT now() NOT NULL
        )`);
      } catch (e) {
        console.error("ensureKbTables failed:", e);
      }
    })();
  }
  return tablesEnsured;
}

// ---------------------------------------------------------------------------
// Default categories — seeded on first run
// ---------------------------------------------------------------------------
export const DEFAULT_CATEGORIES = [
  { name: "Company Information", slug: "company-information", icon: "🏢", description: "About Vyravo AI, mission, team, contact details", color: "#3B82F6" },
  { name: "Services", slug: "services", icon: "⚡", description: "AI Chatbots, Voice Agents, Workflow Automation and more", color: "#06B6D4" },
  { name: "Pricing", slug: "pricing", icon: "💰", description: "Approved pricing guidelines and proposal information", color: "#10B981" },
  { name: "FAQs", slug: "faqs", icon: "❓", description: "Frequently asked questions and answers", color: "#F59E0B" },
  { name: "Industries", slug: "industries", icon: "🏭", description: "Industry-specific solutions and examples", color: "#8B5CF6" },
  { name: "Case Studies", slug: "case-studies", icon: "📊", description: "Client success stories and implementations", color: "#EC4899" },
  { name: "Testimonials", slug: "testimonials", icon: "⭐", description: "Client testimonials and reviews", color: "#F43F5E" },
  { name: "Policies", slug: "policies", icon: "📜", description: "Company policies and guidelines", color: "#64748B" },
  { name: "Terms & Conditions", slug: "terms-conditions", icon: "⚖️", description: "Legal terms and conditions", color: "#6B7280" },
  { name: "Privacy Policy", slug: "privacy-policy", icon: "🔒", description: "Privacy policy and data handling", color: "#6B7280" },
  { name: "Sales Playbooks", slug: "sales-playbooks", icon: "🎯", description: "Internal sales scripts and qualification rules", color: "#F97316" },
  { name: "SOPs", slug: "sops", icon: "📋", description: "Standard operating procedures", color: "#14B8A6" },
  { name: "Internal Documentation", slug: "internal-documentation", icon: "🗂️", description: "Internal team documentation", color: "#6366F1" },
  { name: "Technical Documentation", slug: "technical-documentation", icon: "🔧", description: "Technical specs and architecture docs", color: "#0EA5E9" },
  { name: "Marketing Content", slug: "marketing-content", icon: "📣", description: "Marketing copy and content guidelines", color: "#D946EF" },
  { name: "Email Templates", slug: "email-templates", icon: "✉️", description: "Approved email templates", color: "#84CC16" },
  { name: "Proposal Information", slug: "proposal-information", icon: "📄", description: "Proposal structure and approved content", color: "#FACC15" },
  { name: "Meeting Scripts", slug: "meeting-scripts", icon: "🗣️", description: "Discovery call and meeting scripts", color: "#22C55E" },
  { name: "Support Documentation", slug: "support-documentation", icon: "🛟", description: "Support and troubleshooting docs", color: "#E879F9" },
];

export async function ensureDefaultCategories(): Promise<void> {
  await ensureKbTables();
  try {
    const existing = await db.select({ id: kbCategories.id }).from(kbCategories).limit(1);
    if (existing.length > 0) return;
    for (const [i, cat] of DEFAULT_CATEGORIES.entries()) {
      await db.insert(kbCategories).values({ ...cat, sortOrder: i });
    }
  } catch (e) {
    console.error("ensureDefaultCategories failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Document processing pipeline
// ---------------------------------------------------------------------------
export interface ProcessResult {
  ok: boolean;
  error?: string;
  chunksCount?: number;
}

export async function processDocument(
  documentId: number,
  buffer?: Buffer
): Promise<ProcessResult> {
  try {
    await ensureKbTables();
    await ensureVectorInfrastructure();

    const docs = await db
      .select()
      .from(kbDocuments)
      .where(eq(kbDocuments.id, documentId))
      .limit(1);
    if (docs.length === 0) return { ok: false, error: "Document not found" };
    const doc = docs[0];

    // 1. Extract text — from version content, blob, or the passed buffer
    await db
      .update(kbDocuments)
      .set({
        processingStatus: "processing",
        processingStage: "extracting",
        processingError: null,
        processingAttempts: (doc.processingAttempts ?? 0) + 1,
      })
      .where(eq(kbDocuments.id, documentId));

    let text = "";
    if (buffer) {
      const extracted = await extractTextFromBuffer(
        buffer,
        doc.mimeType || doc.sourceType || "",
        doc.fileName || doc.title
      );
      text = extracted.text;
    } else if (doc.sourceType === "manual" || doc.docType) {
      // Manual content lives in the latest version row
      const versions = await db
        .select({ content: kbDocumentVersions.content })
        .from(kbDocumentVersions)
        .where(eq(kbDocumentVersions.documentId, documentId))
        .orderBy(sql`version DESC`)
        .limit(1);
      text = versions[0]?.content || "";
    } else {
      // Try stored blob (original upload is never lost)
      try {
        const blobs = await db
          .select({ data: kbDocumentBlobs.data })
          .from(kbDocumentBlobs)
          .where(eq(kbDocumentBlobs.documentId, documentId))
          .limit(1);
        if (blobs[0]?.data) {
          const buf = Buffer.from(blobs[0].data, "base64");
          const extracted = await extractTextFromBuffer(
            buf,
            doc.mimeType || doc.sourceType || "",
            doc.fileName || doc.title
          );
          text = extracted.text;
        }
      } catch (e) {
        console.warn(`Blob read failed for doc ${documentId}:`, e);
      }
    }

    if (!text || text.trim().length === 0) {
      await db
        .update(kbDocuments)
        .set({ processingStatus: "failed", processingStage: "extract", processingError: "No extractable text found" })
        .where(eq(kbDocuments.id, documentId));
      return { ok: false, error: "No extractable text found" };
    }

    // 2. Clean text
    const cleaned = cleanText(text);

    // 3. Chunk content (structure-aware)
    const chunks = chunkText(cleaned);

    // 4. Delete old chunks + embeddings (reprocessing)
    await deleteEmbeddingsForDocument(documentId);
    await pool.query(`DELETE FROM kb_chunks WHERE document_id = $1`, [documentId]);

    // 4b. Ensure a version row exists (kb_chunks.version_id is NOT NULL)
    let versionId = doc.currentVersionId;
    if (versionId == null) {
      const verRes = await db
        .insert(kbDocumentVersions)
        .values({
          documentId,
          version: doc.version,
          title: doc.title,
          content: cleaned,
          contentHash: sha256(cleaned),
          status: doc.status,
          accessLevel: doc.accessLevel.toUpperCase(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          changeSummary: "Initial processed content",
        })
        .returning({ id: kbDocumentVersions.id });
      versionId = verRes[0].id;
      await db
        .update(kbDocuments)
        .set({ currentVersionId: versionId })
        .where(eq(kbDocuments.id, documentId));
    }

    // 5. Store chunks (with document metadata denormalized for filtering)
    const chunkIds: number[] = [];
    const catSlug = doc.categoryId
      ? (
          await db
            .select({ slug: kbCategories.slug })
            .from(kbCategories)
            .where(eq(kbCategories.id, doc.categoryId))
            .limit(1)
        )[0]?.slug
      : null;

    for (const chunk of chunks) {
      const inserted = await db
        .insert(kbChunks)
        .values({
          documentId,
          versionId: versionId,
          spaceId: doc.spaceId ?? (await resolveDefaultSpace()),
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          contentHash: sha256(chunk.content),
          heading: chunk.heading,
          sectionPath: chunk.section,
          pageNumber: chunk.pageNumber,
          chunkType: "text",
          documentTitle: doc.title,
          categoryId: doc.categoryId,
          categorySlug: catSlug,
          accessLevel: doc.accessLevel.toUpperCase(),
          status: doc.status === "draft" ? "draft" : "published",
          sourceUri: doc.sourceUri,
          docVersion: doc.version,
          metadata: { documentTitle: doc.title, sourceUrl: doc.sourceUri, version: doc.version },
        })
        .returning({ id: kbChunks.id });
      chunkIds.push(inserted[0].id);
    }

    // 6. Generate embeddings
    await db
      .update(kbDocuments)
      .set({ processingStatus: "indexing", processingStage: "embedding" })
      .where(eq(kbDocuments.id, documentId));

    await storeEmbeddings(
      documentId,
      doc.spaceId,
      chunkIds,
      chunks.map((c) => c.content),
      getEmbeddingModelName(),
      getEmbeddingDimensions()
    );

    // 7. Mark ready + update summary/excerpt on the document
    await db
      .update(kbDocuments)
      .set({
        processingStatus: "ready",
        processingStage: "complete",
        chunkCount: chunks.length,
        summary: cleaned.slice(0, 300),
        embeddingProvider: getEmbeddingProviderLabel(),
        embeddingModel: getEmbeddingModelName(),
        indexedAt: new Date(),
      })
      .where(eq(kbDocuments.id, documentId));

    await logAudit("process", "document", documentId, { chunks: chunks.length });
    return { ok: true, chunksCount: chunks.length };
  } catch (e: any) {
    console.error("processDocument error:", e);
    await db
      .update(kbDocuments)
      .set({
        processingStatus: "failed",
        processingStage: "error",
        processingError: String(e?.message || e),
      })
      .where(eq(kbDocuments.id, documentId));
    return { ok: false, error: String(e?.message || e) };
  }
}

function getEmbeddingProviderLabel(): string {
  return process.env.EMBEDDING_PROVIDER || "local";
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
export async function searchKnowledge(
  options: KBSearchOptions
): Promise<KBSearchResult[]> {
  await ensureKbTables();
  const topK = options.topK || 8;
  const threshold = options.similarityThreshold ?? 0.15;

  let vectorResults: { chunkId: number; documentId: number; score: number }[] = [];
  try {
    if (isEmbeddingConfigured()) {
      vectorResults = await searchVectors(options.query, {
        accessLevels: options.accessLevel || ["internal", "public"],
        categoryId: options.categoryId,
        spaceId: options.clientSpaceId,
        topK: topK * 2,
        threshold,
        excludeArchived: true,
      });
    }
  } catch (e) {
    console.warn("Vector search failed, falling back to keyword:", e);
  }

  const keywordResults = await keywordSearch(options.query, {
    categoryId: options.categoryId,
    accessLevels: options.accessLevel || ["internal", "public"],
    spaceId: options.clientSpaceId,
    type: options.type,
    topK: topK * 2,
  });

  // Hybrid merge: vector * 0.7 + keyword * 0.3 (normalized)
  const merged = new Map<number, { chunkId: number; documentId: number; score: number; vectorScore?: number }>();
  const rawVector = new Map<number, number>();
  const norm = (list: { chunkId: number; score: number }[]) => {
    const maxScore = Math.max(...list.map((r) => r.score), 0.0001);
    const minScore = Math.min(...list.map((r) => r.score), 0);
    const range = maxScore - minScore || 1;
    return new Map(list.map((r) => [r.chunkId, (r.score - minScore) / range]));
  };

  const normVec = vectorResults.length ? norm(vectorResults) : new Map<number, number>();
  const normKw = keywordResults.length ? norm(keywordResults) : new Map<number, number>();

  for (const v of vectorResults) {
    const kw = normKw.get(v.chunkId) ?? 0;
    rawVector.set(v.chunkId, v.score);
    merged.set(v.chunkId, { chunkId: v.chunkId, documentId: v.documentId, score: v.score * 0.7 + kw * 0.3, vectorScore: v.score });
  }
  for (const k of keywordResults) {
    const existing = merged.get(k.chunkId);
    if (!existing) merged.set(k.chunkId, { chunkId: k.chunkId, documentId: k.documentId, score: k.score * 0.3 });
    else existing.score = Math.max(existing.score, k.score * 0.3 + (normVec.get(k.chunkId) ?? 0) * 0.7);
  }

  const sorted = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
  const results: KBSearchResult[] = [];

  for (const hit of sorted) {
    const chunks = await db
      .select({
        chunkId: kbChunks.id,
        content: kbChunks.content,
        heading: kbChunks.heading,
        sectionPath: kbChunks.sectionPath,
        pageNumber: kbChunks.pageNumber,
        categoryId: kbChunks.categoryId,
        accessLevel: kbChunks.accessLevel,
        documentTitle: kbChunks.documentTitle,
      })
      .from(kbChunks)
      .where(eq(kbChunks.id, hit.chunkId))
      .limit(1);

    if (chunks.length === 0) continue;
    const c = chunks[0];

    const docs = await db
      .select({ title: kbDocuments.title })
      .from(kbDocuments)
      .where(eq(kbDocuments.id, hit.documentId))
      .limit(1);

    const cat = c.categoryId
      ? await db.select({ name: kbCategories.name }).from(kbCategories).where(eq(kbCategories.id, c.categoryId)).limit(1)
      : [];

    results.push({
      chunkId: c.chunkId,
      documentId: hit.documentId,
      documentTitle: docs[0]?.title || c.documentTitle || "Untitled",
      content: c.content,
      heading: c.heading,
      section: c.sectionPath,
      pageNumber: c.pageNumber,
      category: cat[0]?.name || null,
      accessLevel: c.accessLevel || "internal",
      score: hit.score,
      vectorScore: rawVector.get(hit.chunkId),
    });
  }

  return results;
}

interface KeywordSearchOptions {
  categoryId?: number;
  accessLevels: string[];
  spaceId?: number;
  type?: string;
  topK: number;
}

async function keywordSearch(
  query: string,
  opts: KeywordSearchOptions
): Promise<{ chunkId: number; documentId: number; score: number }[]> {
  const terms = query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);

  if (terms.length === 0) return [];

  const filters: any[] = [or(...terms.map((t) => ilike(kbChunks.content, `%${t}%`)))];
  if (opts.categoryId != null) filters.push(eq(kbChunks.categoryId, opts.categoryId));
  if (opts.type) filters.push(eq(kbDocuments.docType, opts.type as any));
  if (opts.spaceId != null) filters.push(eq(kbChunks.spaceId, opts.spaceId));
  filters.push(inArray(kbChunks.accessLevel, opts.accessLevels.map((a) => a.toUpperCase())));
  filters.push(sql`${kbDocuments.isArchived} = false`);

  const rows = await db
    .select({ chunkId: kbChunks.id, documentId: kbChunks.documentId, content: kbChunks.content })
    .from(kbChunks)
    .innerJoin(kbDocuments, eq(kbChunks.documentId, kbDocuments.id))
    .where(and(...filters))
    .limit(opts.topK);

  return rows.map((r) => {
    const lower = r.content.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const matches = lower.split(t).length - 1;
      score += matches * 0.25;
    }
    return { chunkId: r.chunkId, documentId: r.documentId, score };
  });
}

// ---------------------------------------------------------------------------
// AI Assistant (RAG answer with citations)
// ---------------------------------------------------------------------------
export async function askKnowledge(
  question: string,
  opts: {
    accessLevels?: AccessLevel[];
    clientSpaceId?: number;
    categoryId?: number;
    sessionId?: string;
  } = {}
): Promise<KBAskResult> {
  await ensureKbTables();
  const accessLevels = opts.accessLevels || ["internal", "public"];

  const results = await searchKnowledge({
    query: question,
    accessLevel: accessLevels,
    categoryId: opts.categoryId,
    clientSpaceId: opts.clientSpaceId,
    topK: 6,
    similarityThreshold: 0.12,
  });

  // Gap detection: no results, weak semantic confidence, OR no keyword
  // overlap with the question — all indicate the KB does not actually
  // contain this knowledge (prevents confidently answering irrelevant chunks).
  const semanticScores = results
    .map((r) => r.vectorScore)
    .filter((s): s is number => s !== undefined);
  const topVectorScore = semanticScores.length ? Math.max(...semanticScores) : undefined;
  const weakSemantic =
    topVectorScore !== undefined && topVectorScore > 0 && topVectorScore < 0.32;

  // Keyword-overlap guard: if the best chunk shares no meaningful term with
  // the question, the match is noise (e.g. "QuickBooks" vs a "Billing" chunk).
  const qTerms = new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3)
  );
  const bestContent = (results[0]?.content || "").toLowerCase();
  const hasOverlap =
    qTerms.size === 0 ||
    [...qTerms].some((t) => bestContent.includes(t));

  if (results.length === 0 || weakSemantic || !hasOverlap) {
    await recordGap(question, opts.sessionId);
    return {
      answer:
        "I don't have enough information in the Vyravo AI Knowledge Base to answer that accurately. Please check with your team or add this information to the Knowledge Base.",
      sources: [],
      confidence: 0,
      gapCreated: true,
    };
  }

  const context = results
    .map(
      (r, i) =>
        `[${i + 1}] (Document: ${r.documentTitle}${r.section ? `, Section: ${r.section}` : ""}${r.pageNumber ? `, Page: ${r.pageNumber}` : ""})\n${r.content}`
    )
    .join("\n\n---\n\n");

  const answer = await generateAnswer(question, context, results);

  const sources = results.slice(0, 5).map((r) => ({
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    section: r.section,
    pageNumber: r.pageNumber,
    sourceUrl: null as string | null,
    excerpt: r.content.slice(0, 200),
  }));

  await logQuery(question, "ask", results.length, results[0]?.score ?? 0, true, opts.sessionId);

  return {
    answer,
    sources,
    confidence: results[0]?.score ?? 0,
  };
}

// ---------------------------------------------------------------------------
// LLM answer generation
// ---------------------------------------------------------------------------
const NO_ANSWER_MESSAGE =
  "I don't have enough information in the Vyravo AI Knowledge Base to answer that accurately.";

async function generateAnswer(question: string, context: string, results: KBSearchResult[] = []): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return extractiveAnswer(question, results);

  try {
    const systemPrompt = `You are Vyravo AI's Internal Knowledge Assistant. You answer questions using ONLY the provided knowledge base context.

STRICT RULES:
1. Answer ONLY from the provided context. NEVER invent services, prices, client names, case studies, statistics, ROI, testimonials, policies, integrations, or business information.
2. If the context does not contain enough information to answer accurately, respond EXACTLY: "${NO_ANSWER_MESSAGE}"
3. Never mention that you use a knowledge base or context.
4. Use citations like [1], [2] after each claim, matching the numbered context blocks.
5. Keep answers concise, professional, and useful for a Vyravo AI team member.
6. If the question is about what to recommend to a customer, give a recommendation grounded strictly in the context.

Priority order when multiple sources conflict: latest approved company knowledge > approved service documentation > approved pricing > approved FAQs > approved case studies > internal documentation.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.KB_LLM_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Knowledge Base Context:\n\n${context}\n\n---\n\nQuestion: ${question}` },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    if (!res.ok) {
      console.warn("KB LLM error:", res.status, await res.text());
      return extractiveAnswer(question, results);
    }

    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text || text.length === 0) return extractiveAnswer(question, results);
    return text;
  } catch (e) {
    console.error("generateAnswer error:", e);
    return extractiveAnswer(question, results);
  }
}

/** Deterministic fallback: quote the highest-scoring chunk. */
function extractiveAnswer(question: string, results: KBSearchResult[]): string {
  if (results.length === 0) return NO_ANSWER_MESSAGE;
  const best = [...results].sort((a, b) => (b.vectorScore ?? b.score) - (a.vectorScore ?? a.score))[0];
  const text = best?.content?.trim();
  if (!text) return NO_ANSWER_MESSAGE;
  const snippet = text.length > 600 ? text.slice(0, 600) + "…" : text;
  const doc = best.documentTitle ? ` (from ${best.documentTitle})` : "";
  return `Based on the available knowledge${doc}: ${snippet}`;
}

// ---------------------------------------------------------------------------
// Knowledge gaps
// ---------------------------------------------------------------------------
export async function recordGap(question: string, sessionId?: string): Promise<number | null> {
  try {
    await ensureKbTables();
    const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");

    const existing = await db
      .select({ id: kbKnowledgeGaps.id })
      .from(kbKnowledgeGaps)
      .where(eq(kbKnowledgeGaps.status, "open"))
      .limit(50);

    for (const gap of existing) {
      const gaps = await db
        .select({ question: kbKnowledgeGaps.question })
        .from(kbKnowledgeGaps)
        .where(eq(kbKnowledgeGaps.id, gap.id))
        .limit(1);
      if (gaps.length && similarEnough(normalized, gaps[0].question.toLowerCase())) {
        await db
          .update(kbKnowledgeGaps)
          .set({ frequency: sql`${kbKnowledgeGaps.frequency} + 1`, updatedAt: new Date() })
          .where(eq(kbKnowledgeGaps.id, gap.id));
        return gap.id;
      }
    }

    const inserted = await db
      .insert(kbKnowledgeGaps)
      .values({
        question: question.trim(),
        frequency: 1,
        source: sessionId ? "assistant" : "search",
        status: "open",
        suggestedAction:
          "Create a knowledge article answering this question, or add it to an existing document.",
      })
      .returning({ id: kbKnowledgeGaps.id });

    return inserted[0]?.id ?? null;
  } catch (e) {
    console.error("recordGap error:", e);
    return null;
  }
}

function similarEnough(a: string, b: string): boolean {
  if (a === b) return true;
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  let overlap = 0;
  for (const w of bWords) if (aWords.has(w)) overlap++;
  return overlap >= Math.min(4, Math.max(aWords.size, bWords.size) * 0.6);
}

// ---------------------------------------------------------------------------
// Analytics logging
// ---------------------------------------------------------------------------
export async function logQuery(
  query: string,
  queryType: "search" | "ask",
  resultsCount: number,
  confidence: number,
  answered: boolean,
  sessionId?: string
): Promise<void> {
  try {
    await ensureKbTables();
    await db.insert(kbQueries).values({
      query,
      queryType,
      resultsCount,
      confidence: String(confidence),
      answered,
      sessionId,
    });
  } catch (e) {
    console.error("logQuery error:", e);
  }
}

export async function logAudit(
  action: string,
  resourceType: string,
  resourceId?: number,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await ensureKbTables();
    await db.insert(kbAuditLogs).values({
      action,
      entityType: resourceType,
      entityId: resourceId,
      metadata: details,
    });
  } catch (e) {
    console.error("logAudit error:", e);
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

let defaultSpaceCache: number | null = null;
async function resolveDefaultSpace(): Promise<number> {
  if (defaultSpaceCache) return defaultSpaceCache;
  try {
    const res = await pool.query(
      `SELECT id FROM knowledge_spaces WHERE is_default = true OR slug = 'vyravo-ai' ORDER BY is_default DESC LIMIT 1`
    );
    defaultSpaceCache = (res.rowCount ?? 0) > 0 ? Number(res.rows[0].id) : 1;
  } catch {
    defaultSpaceCache = 1;
  }
  return defaultSpaceCache;
}

// ---------------------------------------------------------------------------
// Document lifecycle helpers
// ---------------------------------------------------------------------------
export interface CreateDocumentInput {
  title: string;
  content?: string;
  type?: string;
  categoryId?: number;
  tags?: string[];
  status?: DocumentStatus;
  accessLevel?: AccessLevel;
  sourceUrl?: string;
  fileType?: string;
  fileSize?: number;
  originalFileName?: string;
  aiGenerated?: boolean;
  buffer?: Buffer;
  spaceId?: number;
}

export async function createDocument(input: CreateDocumentInput): Promise<number> {
  await ensureKbTables();
  const spaceId = input.spaceId ?? (await resolveDefaultSpace());
  const inserted = await db
    .insert(kbDocuments)
    .values({
      title: input.title,
      spaceId,
      sourceType: input.buffer ? input.fileType || "file" : input.sourceUrl ? "url" : "manual",
      sourceUri: input.sourceUrl,
      categoryId: input.categoryId,
      tags: input.tags,
      status: input.status || "draft",
      accessLevel: (input.accessLevel || "internal").toUpperCase(),
      docType: input.type || "document",
      fileName: input.originalFileName,
      mimeType: input.fileType,
      fileSize: input.fileSize,
      processingStatus: input.buffer ? "pending" : "ready",
      enrichmentStatus: input.aiGenerated ? "pending" : "none",
      enrichmentApproved: false,
    })
    .returning({ id: kbDocuments.id });

  const documentId = inserted[0].id;

  // Store original file bytes (never lose the source document)
  if (input.buffer) {
    await db.insert(kbDocumentBlobs).values({
      documentId,
      fileName: input.originalFileName || input.title,
      mimeType: input.fileType,
      byteSize: input.fileSize || input.buffer.length,
      data: input.buffer.toString("base64"),
    });
  }

  // Version 1 content row (canonical text for manual docs; extracted text later)
  if (input.content) {
    const versionRow = await db
      .insert(kbDocumentVersions)
      .values({
        documentId,
        version: 1,
        title: input.title,
        content: input.content,
        contentHash: sha256(input.content),
        status: input.status || "draft",
        accessLevel: (input.accessLevel || "internal").toUpperCase(),
        categoryId: input.categoryId,
        tags: input.tags,
        changeSummary: input.aiGenerated ? "AI-generated draft (pending human approval)" : "Initial version",
      })
      .returning({ id: kbDocumentVersions.id });
    await db
      .update(kbDocuments)
      .set({ currentVersionId: versionRow[0].id })
      .where(eq(kbDocuments.id, documentId));
  }

  await logAudit("create", "document", documentId, { title: input.title, type: input.type });
  return documentId;
}

export async function updateDocument(
  documentId: number,
  patch: Partial<{
    title: string;
    content: string;
    type: string;
    categoryId: number;
    tags: string[];
    status: DocumentStatus;
    accessLevel: AccessLevel;
    sourceUrl: string;
  }>
): Promise<boolean> {
  const docs = await db
    .select()
    .from(kbDocuments)
    .where(eq(kbDocuments.id, documentId))
    .limit(1);
  if (docs.length === 0) return false;
  const doc = docs[0];

  const newVersion = doc.version + 1;

  // Save previous version (change history) then write new content version
  const versionRow = await db
    .insert(kbDocumentVersions)
    .values({
      documentId,
      version: newVersion,
      title: patch.title ?? doc.title,
      content: patch.content ?? null,
      contentHash: patch.content != null ? sha256(patch.content) : null,
      status: patch.status ?? doc.status,
      accessLevel: (patch.accessLevel ?? doc.accessLevel).toUpperCase(),
      categoryId: patch.categoryId ?? doc.categoryId,
      tags: patch.tags ?? doc.tags,
      changeSummary: patch.content ? "Content updated" : "Metadata updated",
    })
    .returning({ id: kbDocumentVersions.id });

  const updateData: Record<string, unknown> = {
    version: newVersion,
    currentVersionId: versionRow[0].id,
    updatedAt: new Date(),
  };
  if (patch.title !== undefined) updateData.title = patch.title;
  if (patch.type !== undefined) updateData.docType = patch.type;
  if (patch.categoryId !== undefined) updateData.categoryId = patch.categoryId;
  if (patch.tags !== undefined) updateData.tags = patch.tags;
  if (patch.accessLevel !== undefined) updateData.accessLevel = patch.accessLevel.toUpperCase();
  if (patch.sourceUrl !== undefined) updateData.sourceUri = patch.sourceUrl;
  if (patch.status !== undefined) updateData.status = patch.status;

  await db.update(kbDocuments).set(updateData).where(eq(kbDocuments.id, documentId));
  await logAudit("update", "document", documentId, { version: newVersion });
  return true;
}

export async function setDocumentStatus(
  documentId: number,
  status: DocumentStatus
): Promise<void> {
  const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "published") {
    updateData.publishedAt = new Date();
    updateData.publishedVersion = sql`version`;
  }
  if (status === "archived") updateData.isArchived = true;
  if (status !== "archived") updateData.isArchived = false;

  await db.update(kbDocuments).set(updateData).where(eq(kbDocuments.id, documentId));
  await logAudit(status === "archived" ? "archive" : status, "document", documentId);
}

export async function deleteDocument(documentId: number): Promise<void> {
  await ensureKbTables();
  await deleteEmbeddingsForDocument(documentId);
  await pool.query(`DELETE FROM kb_chunks WHERE document_id = $1`, [documentId]);
  await pool.query(`DELETE FROM kb_document_versions WHERE document_id = $1`, [documentId]);
  await pool.query(`DELETE FROM kb_document_blobs WHERE document_id = $1`, [documentId]);
  await db.delete(kbDocuments).where(eq(kbDocuments.id, documentId));
  await logAudit("delete", "document", documentId);
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
export async function getDashboardStats(): Promise<{
  totalItems: number;
  published: number;
  drafts: number;
  categories: number;
  recentlyAdded: number;
  recentlyUpdated: number;
  processing: number;
  failed: number;
  knowledgeGaps: number;
}> {
  await ensureKbTables();
  const [total, published, drafts, categories, recentlyAdded, recentlyUpdated, processing, failed, gaps] =
    await Promise.all([
      db.select({ n: count() }).from(kbDocuments).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbDocuments).where(eq(kbDocuments.status, "published")).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbDocuments).where(eq(kbDocuments.status, "draft")).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbCategories).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbDocuments).where(sql`${kbDocuments.createdAt} > now() - interval '7 days'`).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbDocuments).where(sql`${kbDocuments.updatedAt} > now() - interval '7 days'`).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbDocuments).where(ne(kbDocuments.processingStatus, "ready")).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbDocuments).where(eq(kbDocuments.processingStatus, "failed")).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(kbKnowledgeGaps).where(eq(kbKnowledgeGaps.status, "open")).then((r) => Number(r[0]?.n ?? 0)),
    ]);

  return {
    totalItems: total,
    published,
    drafts,
    categories,
    recentlyAdded,
    recentlyUpdated,
    processing,
    failed,
    knowledgeGaps: gaps,
  };
}
