import type { ContentBlock, TestBlockContent } from "../../types";

export const LESSON_STEP_TAGS = [
  "Hook",
  "Build intuition",
  "Study",
  "Quiz",
  "Flashcards",
  "Reflection",
  "Unit test",
] as const;

export function getLessonBlocks(blocks: ContentBlock[]) {
  return {
    animation: blocks.find((b) => b.type === "Animation"),
    mcqs: blocks.filter((b) => b.type === "MCQ"),
    flashcard: blocks.find((b) => b.type === "Flashcard"),
    test: blocks.find((b) => b.type === "Test"),
  };
}

export function mcqFromBlock(block: ContentBlock) {
  const c = block.content ?? {};
  const question = c.question ?? block.title;
  const rawOptions = c.options;
  const options = Array.isArray(rawOptions)
    ? rawOptions.map(String)
    : rawOptions && typeof rawOptions === "object"
      ? Object.values(rawOptions as Record<string, string>).map(String)
      : [];
  if (!question || !options.length) return null;
  const correctRaw = c.correct;
  const correct =
    typeof correctRaw === "number"
      ? correctRaw
      : typeof correctRaw === "string"
        ? parseInt(correctRaw, 10)
        : 0;
  return {
    id: String(c.id ?? block.id),
    question: String(question),
    options,
    correct: Number.isFinite(correct) && correct >= 0 && correct < options.length ? correct : 0,
    hints: c.hints,
    explanation: typeof c.explanation === "string" ? c.explanation : undefined,
  };
}

export function flashcardsFromBlock(block: ContentBlock | undefined) {
  if (!block) return [];
  const cards = block.content?.cards;
  if (!Array.isArray(cards)) return [];
  return cards
    .map((c) => ({
      front: String((c as { front?: string }).front ?? ""),
      back: String((c as { back?: string }).back ?? ""),
    }))
    .filter((c) => c.front && c.back);
}

export function testFromBlock(block: ContentBlock | undefined): TestBlockContent | null {
  if (!block?.content) return null;
  const c = block.content as TestBlockContent;
  if (!Array.isArray(c.questions) || !c.questions.length) return null;
  return c;
}
