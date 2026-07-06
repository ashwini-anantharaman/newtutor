import { BookOpen, Globe, Lightbulb } from "lucide-react";
import type { OwlwiseMode } from "../../../constants/owlwiseTheme";

const MODE_META: Record<
  OwlwiseMode,
  { label: string; icon: typeof Globe; description: string }
> = {
  narrative: {
    label: "Real world explanation",
    icon: Globe,
    description: "Tap the icons in the corner to hear it explained a different way.",
  },
  interactive: {
    label: "Conversational explanation",
    icon: Lightbulb,
    description: "Tap the icons in the corner to hear it explained a different way.",
  },
  summary: {
    label: "Textbook explanation",
    icon: BookOpen,
    description: "Tap the icons in the corner to hear it explained a different way.",
  },
};

function formatBodyText(text: string): string {
  return text.replace(/\\n/g, "\n").replace(/\\t/g, "\t").trim();
}

export function StudyStep({
  conceptName,
  heading,
  body,
  loading,
  mode,
  availableModes,
  onModeChange,
}: {
  conceptName: string;
  heading: string;
  body: string[];
  loading?: boolean;
  mode: OwlwiseMode;
  availableModes: OwlwiseMode[];
  onModeChange: (m: OwlwiseMode) => void;
}) {
  const meta = MODE_META[mode];
  const ModeIcon = meta.icon;

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 sm:p-8 relative">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-zinc-500 mb-2">
              Study · {conceptName}
            </p>
            <h2
              className="text-[22px] sm:text-[28px] font-bold text-white leading-snug"
              style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
            >
              {heading}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0 bg-zinc-950/80 rounded-full p-1 border border-zinc-800">
            {(["narrative", "interactive", "summary"] as OwlwiseMode[]).map((m) => {
              if (!availableModes.includes(m)) return null;
              const Icon = MODE_META[m].icon;
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModeChange(m)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    active ? "bg-zinc-800 ring-1 ring-zinc-600" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={MODE_META[m].label}
                >
                  <Icon size={16} className={active ? "text-white" : undefined} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950 border border-zinc-800 mb-6">
          <ModeIcon size={14} className="text-zinc-400" />
          <span className="text-xs text-zinc-400">{meta.label}</span>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500 animate-pulse">Loading lesson content…</p>
        ) : (
          <div className="space-y-5">
            {body.map((paragraph, i) => (
              <p key={i} className="text-[15px] text-zinc-300 leading-relaxed whitespace-pre-line">
                {formatBodyText(paragraph)}
              </p>
            ))}
          </div>
        )}

        <p className="text-[11px] text-zinc-600 mt-8">{meta.description}</p>
      </div>
    </div>
  );
}
