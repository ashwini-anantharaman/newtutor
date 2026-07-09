import type { DraftCourseStructure } from "./lessonNormalize.js";

export interface TocChapterOutline {
  number: number;
  title: string;
  pageStart: number;
}

function cleanChapterTitle(title: string): string {
  return title.replace(/\s+/g, " ").replace(/\.\.\.\s*\d+\s*$/, "").trim();
}

function isSkippedTocTitle(title: string): boolean {
  return /^(glossary|index|introduction|preface|contents|resources)$/i.test(title);
}

/** Pull numbered chapters and their starting pages from a table of contents. */
export function extractChapterOutlineFromToc(text: string): TocChapterOutline[] {
  const byNumber = new Map<number, TocChapterOutline>();

  const add = (num: number, title: string, pageStart?: number) => {
    const clean = cleanChapterTitle(title);
    if (num < 1 || num > 40 || clean.length < 3 || isSkippedTocTitle(clean)) return;
    const existing = byNumber.get(num);
    const page = pageStart ?? existing?.pageStart ?? 0;
    if (!existing || (pageStart && pageStart > 0)) {
      byNumber.set(num, { number: num, title: clean, pageStart: page });
    }
  };

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    let m =
      trimmed.match(/^chapter\s*(\d{1,2})[:.)-–—\s]+(.+?)(?:\s*\.\.\.\s*(\d+))?$/i) ??
      trimmed.match(/^ch\.?\s*(\d{1,2})[:.)-–—\s]+(.+?)(?:\s*\.\.\.\s*(\d+))?$/i);
    if (m) {
      add(parseInt(m[1], 10), m[2], m[3] ? parseInt(m[3], 10) : undefined);
      continue;
    }
    m = trimmed.match(/^(\d{1,2})[.)]\s+([A-Z][^0-9]{4,70}?)(?:\s*\.\.\.\s*(\d+))?$/);
    if (m) add(parseInt(m[1], 10), m[2], m[3] ? parseInt(m[3], 10) : undefined);
  }

  const inline = text.matchAll(
    /chapter\s*(\d{1,2})\s*:\s*([^.\n]+?)(?:\s*\.\.\.\s*(\d+))?(?=\s+chapter\s*\d|\s+part\s+\d|\s+glossary|$)/gi
  );
  for (const m of inline) {
    add(parseInt(m[1], 10), m[2], m[3] ? parseInt(m[3], 10) : undefined);
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/** Pull numbered chapter titles from a table-of-contents block (Brain Facts, textbooks, etc.). */
export function extractChapterTitlesFromToc(text: string): string[] {
  return extractChapterOutlineFromToc(text).map((c) => c.title);
}

export function chapterPageRanges(outline: TocChapterOutline[]): { title: string; start: number; end: number }[] {
  return outline.map((ch, i) => {
    const next = outline[i + 1];
    const end = next?.pageStart && next.pageStart > ch.pageStart ? next.pageStart - 1 : ch.pageStart + 45;
    return { title: ch.title, start: ch.pageStart || 1, end };
  });
}

export function buildDraftFromChapterTitles(
  titles: string[],
  title = "Untitled course"
): DraftCourseStructure {
  const chapters = titles.map((name, i) => ({
    label: `CH ${i + 1}: ${name}`,
    title: `Chapter ${i + 1}`,
    modules: [{ name, prereqs: i > 0 ? [titles[i - 1]] : [] }],
  }));

  const prerequisiteEdges = titles.slice(1).map((name, i) => ({
    from: titles[i],
    to: name,
  }));

  return {
    title,
    chapters,
    prerequisiteEdges,
    message: `Structured from ${titles.length} chapters detected in the table of contents.`,
  };
}
