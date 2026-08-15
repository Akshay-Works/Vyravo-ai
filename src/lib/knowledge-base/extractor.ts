// Document Text Extraction
// Supports: PDF, DOCX, TXT, Markdown, CSV, XLSX
// Falls back gracefully when a file cannot be parsed.

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  format: string;
}

const MAX_EXTRACTED_CHARS = 1_000_000; // safety cap

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string,
  originalName: string
): Promise<ExtractionResult> {
  const type = normalizeType(fileType, originalName);

  switch (type) {
    case "pdf": return extractPdf(buffer);
    case "docx": return extractDocx(buffer);
    case "xlsx": return extractXlsx(buffer);
    case "csv": return extractCsv(buffer);
    case "md": return extractMarkdown(buffer);
    case "txt": return extractTxt(buffer);
    default:
      throw new Error(`Unsupported file type: ${type}`);
  }
}

function normalizeType(fileType: string, originalName: string): string {
  const mime = (fileType || "").toLowerCase();
  const ext = originalName.split(".").pop()?.toLowerCase() || "";
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.includes("word") || mime.includes("docx") || ext === "docx") return "docx";
  if (mime.includes("spreadsheet") || mime.includes("excel") || ext === "xlsx" || ext === "xls") return "xlsx";
  if (mime.includes("csv") || ext === "csv") return "csv";
  if (ext === "md" || ext === "markdown") return "md";
  if (mime.includes("text") || ext === "txt") return "txt";
  return "unknown";
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  // pdf-parse v1 default export / v2 named export compatibility
  const mod: any = await import("pdf-parse");
  const pdfParse = mod.default || mod.PDFParse || mod;
  const data = await pdfParse(buffer, { max: 200 });
  return {
    text: cap(data.text || ""),
    pageCount: data.numpages,
    format: "pdf",
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return { text: cap(result.value || ""), format: "docx" };
}

async function extractXlsx(buffer: Buffer): Promise<ExtractionResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  let out = "";
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    out += `## Sheet: ${sheetName}\n`;
    out += XLSX.utils.sheet_to_csv(sheet);
    out += "\n\n";
  }
  return { text: cap(out), format: "xlsx" };
}

async function extractCsv(buffer: Buffer): Promise<ExtractionResult> {
  return { text: cap(buffer.toString("utf-8")), format: "csv" };
}

async function extractMarkdown(buffer: Buffer): Promise<ExtractionResult> {
  return { text: cap(buffer.toString("utf-8")), format: "md" };
}

async function extractTxt(buffer: Buffer): Promise<ExtractionResult> {
  return { text: cap(buffer.toString("utf-8")), format: "txt" };
}

function cap(text: string): string {
  return text.length > MAX_EXTRACTED_CHARS
    ? text.slice(0, MAX_EXTRACTED_CHARS)
    : text;
}

/** Read a file from the uploads directory (if filePath is stored). */
export async function readStoredFile(filePath: string): Promise<Buffer> {
  const { promises: fs } = await import("fs");
  return fs.readFile(filePath);
}

export function getUploadDir(): string {
  return process.env.KB_UPLOAD_DIR || "/tmp/kb-uploads";
}
