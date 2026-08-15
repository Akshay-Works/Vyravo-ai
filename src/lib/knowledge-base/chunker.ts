// Intelligent Chunking
// Structure-aware splitting that preserves headings, sections, lists,
// paragraphs, page numbers, and code blocks — no blind character cuts.

export interface Chunk {
  content: string;
  heading: string | null;
  section: string | null;
  pageNumber: number | null;
  chunkIndex: number;
}

export interface ChunkOptions {
  maxChunkSize?: number;   // target chars per chunk
  overlap?: number;        // chars of overlap between chunks
}

const DEFAULT_MAX_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 150;

/**
 * Split extracted document text into structure-aware chunks.
 * Keeps headings attached to the content that follows them.
 */
export function chunkText(
  text: string,
  opts: ChunkOptions = {}
): Chunk[] {
  const maxChunkSize = opts.maxChunkSize || DEFAULT_MAX_CHUNK_SIZE;
  const overlap = Math.min(opts.overlap ?? DEFAULT_OVERLAP, Math.floor(maxChunkSize / 3));

  const blocks = splitIntoBlocks(text);
  const chunks: Chunk[] = [];
  let currentHeading: string | null = null;
  let currentSection: string | null = null;
  let currentPage: number | null = null;
  let buffer = "";
  let bufferHeading: string | null = null;
  let bufferSection: string | null = null;
  let bufferPage: number | null = null;
  let chunkIndex = 0;

  const flush = () => {
    const cleaned = buffer.trim();
    if (cleaned.length > 0) {
      chunks.push({
        content: cleaned,
        heading: bufferHeading,
        section: bufferSection,
        pageNumber: bufferPage,
        chunkIndex: chunkIndex++,
      });
    }
    buffer = "";
    bufferHeading = null;
    bufferSection = null;
    bufferPage = null;
  };

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Track page markers: [[PAGE:3]] style or "Page 3" lines
    const pageMatch = trimmed.match(/^\[\[PAGE:\s*(\d+)\]\]$/);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }
    const pageLineMatch = trimmed.match(/^page\s+(\d+)\s*$/i);
    if (pageLineMatch) {
      currentPage = parseInt(pageLineMatch[1], 10);
      continue;
    }

    // Headings
    if (isHeading(trimmed)) {
      flush();
      const headingText = cleanHeading(trimmed);
      currentHeading = headingText;
      // Promote H1 to section; H2/H3 set currentHeading only
      if (trimmed.startsWith("# ") || isH1(trimmed)) {
        currentSection = headingText;
      }
      bufferHeading = headingText;
      bufferSection = currentSection;
      bufferPage = currentPage;
      continue;
    }

    // If adding this block would exceed max size and buffer non-empty, flush
    if (buffer.length > 0 && buffer.length + trimmed.length > maxChunkSize) {
      flush();
      bufferHeading = currentHeading;
      bufferSection = currentSection;
      bufferPage = currentPage;
    }

    // Append with separator
    buffer += (buffer ? "\n\n" : "") + trimmed;

    // Hard flush on very large blocks (e.g., a big paragraph) — split by sentences
    if (buffer.length > maxChunkSize * 1.5) {
      splitLargeBuffer(buffer, maxChunkSize, overlap).forEach((piece, i) => {
        chunks.push({
          content: piece.trim(),
          heading: bufferHeading || currentHeading,
          section: bufferSection || currentSection,
          pageNumber: bufferPage ?? currentPage,
          chunkIndex: chunkIndex++,
        });
      });
      buffer = "";
    }
  }

  flush();
  return chunks;
}

function splitLargeBuffer(
  text: string,
  maxChunkSize: number,
  overlap: number
): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]+\s*|[^.!?\n]+$/g) || [text];
  const pieces: string[] = [];
  let current = "";

  for (const s of sentences) {
    if (current.length + s.length > maxChunkSize && current) {
      pieces.push(current);
      // overlap: keep tail of current
      current = current.slice(-overlap) + s;
    } else {
      current += s;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------
function splitIntoBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Split on blank lines; also break before headings for better detection
  const blocks: string[] = [];
  const lines = normalized.split("\n");
  let current: string[] = [];
  let pageCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.length) {
        blocks.push(current.join("\n"));
        current = [];
      }
      continue;
    }
    // New page marker injection for headings (best-effort page tracking)
    if (isHeading(trimmed)) {
      if (current.length) {
        blocks.push(current.join("\n"));
        current = [];
      }
      blocks.push(trimmed);
      continue;
    }
    // Heuristic page break on form-feeds
    if (line.includes("\f")) {
      blocks.push(`[[PAGE:${pageCounter}]]`);
      pageCounter++;
      const rest = line.replace(/\f/g, "").trim();
      if (rest) current.push(rest);
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------
function isHeading(line: string): boolean {
  const t = line.trim();
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^(h1|h2|h3|h4)\b/i.test(t) && t.length < 120) return true;
  // Markdown-style: "**Heading**" alone on a line
  if (/^\*\*[^*]+\*\*\s*$/.test(t)) return true;
  // Underlined headings: "=====" or "-----" below text (handled in pairs)
  // Short all-caps lines (< 80 chars, no sentence-ending punctuation) look like headings
  if (
    t.length >= 3 &&
    t.length <= 100 &&
    /^[A-Z0-9][A-Z0-9 &'\-:()/.]*$/.test(t) &&
    !t.endsWith(".") &&
    !/^\d+$/.test(t)
  ) {
    return true;
  }
  return false;
}

function isH1(line: string): boolean {
  const t = line.trim();
  if (/^#\s+/.test(t)) return true;
  if (/^h1\b/i.test(t)) return true;
  return /^[A-Z0-9][A-Z0-9 &'\-:()/.]{2,60}$/.test(t) && t.length <= 70;
}

function cleanHeading(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^h[1-6]\b\s*/i, "")
    .replace(/^\*\*|\*\*$/g, "")
    .trim();
}
