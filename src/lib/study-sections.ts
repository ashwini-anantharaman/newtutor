export interface StudySection {
  concept: string;
  text: string;
  check: string;
}

export function sanitizeLessonText(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").trim();
}

export function isPlaceholderMcqOption(opt: string): boolean {
  const t = opt.trim();
  return /^option\s*[a-d]$/i.test(t) || t.length < 4;
}

export function isPlaceholderMcq(options: string[]): boolean {
  if (options.length < 4) return true;
  return options.filter((o) => isPlaceholderMcqOption(o)).length >= 3;
}

export function sectionsFromTextContent(c: Record<string, unknown>, conceptName: string): StudySection[] {
  if (Array.isArray(c.sections)) {
    return (c.sections as StudySection[])
      .map((s) => ({
        concept: sanitizeLessonText(String(s.concept ?? "")),
        text: sanitizeLessonText(String(s.text ?? "")),
        check: sanitizeLessonText(String(s.check ?? "")),
      }))
      .filter((s) => s.concept && s.text);
  }
  let body = Array.isArray(c.body) ? (c.body as string[]).map(sanitizeLessonText) : [];
  if (!body.length && typeof c.body === "string") {
    body = [sanitizeLessonText(c.body)];
  }
  if (body.length === 1 && body[0].includes("\n")) {
    const parts = body[0]
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) body = parts;
  }
  return body.map((text, i) => ({
    concept: i === 0 ? conceptName : `${conceptName} — part ${i + 1}`,
    text,
    check: `In your own words, what is the main idea in this section?`,
  }));
}
