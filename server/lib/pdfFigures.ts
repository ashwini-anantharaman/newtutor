import sharp from "sharp";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { supabaseAdmin } from "./supabase.js";
import { formatErrorMessage } from "./errors.js";

const SOURCES_BUCKET = "sources";
const MIN_FIGURE_PX = 140;
const MAX_FIGURES_PER_PAGE = 3;
const MAX_FIGURES_TOTAL = 100;

export type PdfFigure = {
  page: number;
  storagePath: string;
  width: number;
  height: number;
};

type RawFigure = {
  page: number;
  jpeg: Buffer;
  width: number;
  height: number;
};

/** Extract embedded figures from a PDF (diagrams, photos) — not full-page scans. */
export async function extractPdfFigures(buffer: Buffer): Promise<RawFigure[]> {
  const figures: RawFigure[] = [];
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;

  for (let pageNum = 1; pageNum <= pdf.numPages && figures.length < MAX_FIGURES_TOTAL; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const ops = await page.getOperatorList();
    const seen = new Set<string>();
    let pageCount = 0;

    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== OPS.paintImageXObject) continue;
      const name = String(ops.argsArray[i][0]);
      if (seen.has(name)) continue;
      seen.add(name);

      let img: {
        width?: number;
        height?: number;
        kind?: number;
        data?: Uint8Array | Uint8ClampedArray;
      } | null = null;
      try {
        img = (await page.objs.get(name)) as typeof img;
      } catch {
        continue;
      }

      if (!img?.width || !img?.height || !img.data?.length) continue;
      if (img.width < MIN_FIGURE_PX || img.height < MIN_FIGURE_PX) continue;

      const channels = img.kind === 3 ? 4 : img.kind === 2 ? 3 : 1;
      const expected = img.width * img.height * channels;
      if (img.data.length < expected * 0.9) continue;

      try {
        const jpeg = await sharp(Buffer.from(img.data), {
          raw: { width: img.width, height: img.height, channels },
        })
          .jpeg({ quality: 84 })
          .toBuffer();
        figures.push({ page: pageNum, jpeg, width: img.width, height: img.height });
        pageCount++;
        if (pageCount >= MAX_FIGURES_PER_PAGE || figures.length >= MAX_FIGURES_TOTAL) break;
      } catch {
        /* skip malformed bitmap */
      }
    }
  }

  return figures;
}

/** Store extracted figures in Supabase Storage under the source folder. */
export async function storePdfFigures(
  courseId: string,
  sourceId: string,
  buffer: Buffer
): Promise<PdfFigure[]> {
  const raw = await extractPdfFigures(buffer);
  if (!raw.length) return [];

  const stored: PdfFigure[] = [];
  for (let i = 0; i < raw.length; i++) {
    const fig = raw[i]!;
    const storagePath = `${courseId}/${sourceId}/figures/p${fig.page}-${i + 1}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(SOURCES_BUCKET)
      .upload(storagePath, fig.jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.warn(`[pdfFigures] Upload failed ${storagePath}:`, error.message);
      continue;
    }
    stored.push({ page: fig.page, storagePath, width: fig.width, height: fig.height });
  }
  return stored;
}

/** Extract figures for a course PDF if not already stored (handles uploads before this feature). */
export async function ensureCoursePdfFigures(courseId: string): Promise<PdfFigure[]> {
  const { data: sources, error } = await supabaseAdmin
    .from("sources")
    .select("id, name, type, storage_path, status")
    .eq("course_id", courseId)
    .eq("type", "PDF")
    .eq("status", "ready")
    .not("storage_path", "is", null);

  if (error) throw new Error(formatErrorMessage(error));

  const all: PdfFigure[] = [];
  for (const source of sources ?? []) {
    if (!source.storage_path) continue;
    const prefix = `${courseId}/${source.id}/figures`;
    const { data: existing } = await supabaseAdmin.storage.from(SOURCES_BUCKET).list(prefix);
    if (existing?.some((f) => f.name?.endsWith(".jpg"))) {
      for (const f of existing) {
        if (!f.name?.endsWith(".jpg")) continue;
        const pageMatch = f.name.match(/^p(\d+)-/);
        all.push({
          page: pageMatch ? parseInt(pageMatch[1], 10) : 1,
          storagePath: `${prefix}/${f.name}`,
          width: 0,
          height: 0,
        });
      }
      continue;
    }

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(SOURCES_BUCKET)
      .download(source.storage_path);
    if (dlErr || !file) {
      console.warn(`[pdfFigures] Could not download ${source.name}:`, dlErr?.message);
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    console.info(`[pdfFigures] Extracting figures from "${source.name}"…`);
    const stored = await storePdfFigures(courseId, source.id, buffer);
    all.push(...stored);
  }
  return all;
}

export type FigureWithUrl = {
  page: number;
  src: string;
  caption: string;
  storagePath: string;
};

/** Signed URLs for all PDF figures in a course. */
export async function listCoursePdfFigures(courseId: string): Promise<FigureWithUrl[]> {
  const stored = await ensureCoursePdfFigures(courseId);
  const out: FigureWithUrl[] = [];
  for (const fig of stored) {
    const { data, error } = await supabaseAdmin.storage
      .from(SOURCES_BUCKET)
      .createSignedUrl(fig.storagePath, 60 * 60 * 24 * 7);
    if (error || !data?.signedUrl) continue;
    out.push({
      page: fig.page,
      src: data.signedUrl,
      caption: `Figure · p. ${fig.page}`,
      storagePath: fig.storagePath,
    });
  }
  return out.sort((a, b) => a.page - b.page);
}
