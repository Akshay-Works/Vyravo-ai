// Knowledge Base Types

export type DocumentType =
  | "document"
  | "article"
  | "faq"
  | "qa"
  | "sop"
  | "note"
  | "website_content"
  | "service_doc";

export type DocumentStatus =
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "archived";

export type AccessLevel =
  | "public"
  | "internal"
  | "confidential"
  | "client-specific"
  | "restricted";

export type ProcessingStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "indexing"
  | "ready"
  | "failed";

export type KBUserRole = "admin" | "editor" | "viewer";

export interface KBSearchResult {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  content: string;
  heading: string | null;
  section: string | null;
  pageNumber: number | null;
  category: string | null;
  accessLevel: string;
  score: number;
  vectorScore?: number;
}

export interface KBSearchOptions {
  query: string;
  categoryId?: number;
  accessLevel?: AccessLevel[];
  clientSpaceId?: number;
  topK?: number;
  similarityThreshold?: number;
  type?: DocumentType;
  tags?: string[];
}

export interface KBAskResult {
  answer: string;
  sources: {
    documentId: number;
    documentTitle: string;
    section: string | null;
    pageNumber: number | null;
    sourceUrl: string | null;
    excerpt: string;
  }[];
  confidence: number;
  gapCreated?: boolean;
}

export interface KBAnalytics {
  totalDocuments: number;
  publishedCount: number;
  draftCount: number;
  categoryCount: number;
  totalChunks: number;
  totalQueries: number;
  totalGaps: number;
  recentDocuments: { id: number; title: string; status: string; updatedAt: Date }[];
  topCategories: { id: number; name: string; count: number }[];
  queriesByDay: { date: string; count: number }[];
}

export interface KBDashboardStats {
  totalItems: number;
  published: number;
  drafts: number;
  categories: number;
  recentlyAdded: number;
  recentlyUpdated: number;
  processing: number;
  failed: number;
  knowledgeGaps: number;
}
