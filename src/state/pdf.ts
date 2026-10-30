/**
 * PDF text extraction boundary (ISC-20).
 *
 * pdf.js stays behind this single module: it is loaded lazily (dynamic
 * import, so the ~1MB library never lands in the main bundle and Vite issues
 * with it cannot leak into the rest of the build), and a clear
 * PdfExtractionError is thrown when a PDF has no extractable text (scanned
 * images) or fails to parse. Callers inject `extractPdfText` into
 * chunks.ingestFile.
 */

export class PdfExtractionError extends Error {
  constructor(fileName: string, detail: string) {
    super(`Could not extract text from '${fileName}': ${detail}`);
    this.name = "PdfExtractionError";
  }
}

interface TextItemLike {
  readonly str?: string;
}

/** Extract plain text from a PDF File. Throws PdfExtractionError on failure. */
export async function extractPdfText(file: File): Promise<string> {
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  } catch {
    throw new PdfExtractionError(file.name, "PDF engine failed to load in this browser");
  }

  try {
    const data = await file.arrayBuffer();
    const task = pdfjs.getDocument({ data });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => (item as TextItemLike).str ?? "")
        .join(" ");
      pages.push(pageText);
    }
    await task.destroy();

    const text = pages.join("\n\n").trim();
    if (text.length === 0) {
      throw new PdfExtractionError(
        file.name,
        "its text layer is empty (the PDF may be a scanned image), so convert it to .txt/.md and re-upload",
      );
    }
    return text;
  } catch (err) {
    if (err instanceof PdfExtractionError) throw err;
    throw new PdfExtractionError(
      file.name,
      "Abductive could not open the file as a PDF, so convert it to .txt/.md and re-upload",
    );
  }
}
