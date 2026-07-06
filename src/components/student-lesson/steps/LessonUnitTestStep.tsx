import { useState } from "react";
import { Lock } from "lucide-react";
import type { TestBlockContent } from "../../../types";

export function LessonUnitTestStep({
  content,
  onSubmitted,
}: {
  content: TestBlockContent;
  onSubmitted: (scorePct: number, passed: boolean) => void;
}) {
  const questions = content.questions ?? [];
  const passPct = Number(content.passPct) || 80;
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const q = questions[qIndex];
  const total = questions.length;
  const allAnswered = Object.keys(answers).length === total;

  const submitTest = () => {
    const correctCount = questions.filter((qu, i) => answers[i] === qu.correct).length;
    const scorePct = Math.round((correctCount / total) * 100);
    setSubmitted(true);
    onSubmitted(scorePct, scorePct >= passPct);
  };

  if (!q) {
    return <p className="text-zinc-500 text-sm">No unit test for this lesson yet.</p>;
  }

  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <Lock size={14} className="text-[#a0522d]" />
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-[#a0522d]">Unit test</p>
      </div>
      <p className="text-[11px] tracking-[0.15em] uppercase text-zinc-500 mb-3">
        Question {qIndex + 1} of {total}
      </p>
      <div className="w-8 h-1 bg-[#a0522d] rounded-full mx-auto mb-6" />

      <h2
        className="text-[22px] sm:text-[28px] font-bold text-[#1a1a1a] mb-8 leading-snug"
        style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
      >
        {q.question}
      </h2>

      <div className="space-y-3 mb-6">
        {q.options.map((opt, i) => {
          const selected = answers[qIndex] === i;
          const showResult = submitted;
          const isCorrect = showResult && i === q.correct;
          const isWrong = showResult && selected && i !== q.correct;
          return (
            <button
              key={i}
              type="button"
              disabled={submitted}
              onClick={() => setAnswers((prev) => ({ ...prev, [qIndex]: i }))}
              className={`w-full text-left px-6 py-4 rounded-full text-[15px] font-medium transition-all ${
                isCorrect
                  ? "bg-emerald-600 text-white"
                  : isWrong
                    ? "bg-red-600 text-white"
                    : selected
                      ? "bg-[#1a1a1a] text-white"
                      : "bg-[#1a1a1a] text-white hover:bg-black"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {!submitted && (
        <div className="flex justify-center gap-3">
          {qIndex > 0 && (
            <button
              type="button"
              onClick={() => setQIndex((i) => i - 1)}
              className="px-5 py-2 rounded-full border border-zinc-300 text-sm text-zinc-600"
            >
              Back
            </button>
          )}
          {qIndex < total - 1 ? (
            <button
              type="button"
              onClick={() => setQIndex((i) => i + 1)}
              disabled={answers[qIndex] === undefined}
              className="px-6 py-2 rounded-full bg-[#1a1a1a] text-white text-sm font-semibold disabled:opacity-40"
            >
              Next question
            </button>
          ) : (
            <button
              type="button"
              onClick={submitTest}
              disabled={!allAnswered}
              className="px-6 py-2 rounded-full bg-[#1a1a1a] text-white text-sm font-semibold disabled:opacity-40"
            >
              Submit test
            </button>
          )}
        </div>
      )}

      {submitted && (
        <p className="text-sm text-zinc-600">
          Score submitted — hit Continue to finish the unit.
        </p>
      )}
    </div>
  );
}
