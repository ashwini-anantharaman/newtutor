import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ChevronRight, Check, BookOpen, Columns2, PanelLeftOpen } from "lucide-react";
import type { ContentBlock, ContentMode } from "../types";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { DataAPI } from "../lib/api";
import { blocksForConcept, StudentContentBlock } from "../lib/content-blocks";
import { AnimationPanel } from "../components/AnimationPanel";
import { AdaptiveMCQSession } from "../components/AdaptiveMCQSession";
import { ReferencePdfViewer } from "../components/ReferencePdfViewer";
import {
  CONTENT_TO_OWLWISE,
  OWLWISE_TO_CONTENT,
  type OwlwiseMode,
} from "../constants/owlwiseTheme";
import { FloatingLessonChat } from "../components/FloatingLessonChat";
import { IconInteractive, IconSummary, IconNarrative } from "../components/owlwise/ModeIcons";
import { buildUnitReferencePages } from "../lib/unit-reference";

const MODE_FONT: Record<OwlwiseMode, string | undefined> = {
  interactive: undefined,
  summary: "'PT Serif', Georgia, serif",
  narrative: "'IBM Plex Mono', monospace",
};

function groupBlocks(blocks: ContentBlock[]): (ContentBlock | { type: "MCQGroup"; blocks: ContentBlock[] })[] {
  const out: (ContentBlock | { type: "MCQGroup"; blocks: ContentBlock[] })[] = [];
  const mcqs = blocks.filter((b) => b.type === "MCQ");
  let mcqPlaced = false;
  for (const b of blocks) {
    if (b.type === "MCQ") {
      if (!mcqPlaced) {
        out.push({ type: "MCQGroup", blocks: mcqs });
        mcqPlaced = true;
      }
      continue;
    }
    out.push(b);
  }
  return out;
}

export function StudentConceptScreen() {
  const {
    activeConceptId,
    setActiveConceptId,
    setScreen,
    learner,
    logModeSwitch,
    concepts,
    courseId,
    courseTitle,
    modules,
    conceptAvailability,
    updateLearner,
    lessonPanel,
    setLessonPanel,
    ragSources,
  } = useApp();

  const concept = concepts.find((c) => c.id === activeConceptId) ?? concepts[0];
  const conceptId = concept?.id ?? "";
  const availability = conceptAvailability[conceptId] ?? { modes: [], hasInteractive: false };

  const availableOwlModes = useMemo(() => {
    const modes = availability.modes.map((m) => CONTENT_TO_OWLWISE[m]);
    return modes.length ? modes : (["interactive", "summary", "narrative"] as OwlwiseMode[]);
  }, [availability.modes]);

  const initialMode = CONTENT_TO_OWLWISE[learner.defaultMode] ?? "interactive";
  const [owlMode, setOwlMode] = useState<OwlwiseMode>(
    availableOwlModes.includes(initialMode) ? initialMode : availableOwlModes[0] ?? "interactive"
  );
  const [modeSwitched, setModeSwitched] = useState(false);
  const contentMode: ContentMode = OWLWISE_TO_CONTENT[owlMode];

  const [modeContent, setModeContent] = useState<{
    heading: string;
    body: string[];
    citation?: string;
  } | null>(null);
  const [modeLoading, setModeLoading] = useState(false);

  const conceptBlocks = useMemo(
    () => (concept ? blocksForConcept(modules, conceptId, concept.name) : []),
    [modules, conceptId, concept]
  );
  const textBlocks = conceptBlocks.filter((b) => b.type === "Text");
  const hasTextBlock = textBlocks.length > 0;
  const grouped = useMemo(
    () => groupBlocks(conceptBlocks.filter((b) => b.type !== "Text")),
    [conceptBlocks]
  );

  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [pdfName, setPdfName] = useState<string>("");
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | undefined>();

  const pdfPanelVisible =
    lessonPanel === "split" || lessonPanel === "pdf" || lessonPanel === "transcript";

  const collapsePdf = () => setLessonPanel("notes");
  const expandPdf = () => setLessonPanel(lessonPanel === "notes" ? "split" : "pdf");

  useEffect(() => {
    if (!courseId) return;
    setPdfLoading(true);
    setPdfError(null);
    setPdfData(null);

    const load = async () => {
      try {
        const { data, name } = await DataAPI.referencePdfBlob(courseId);
        setPdfData(data);
        setPdfName(name);
        return;
      } catch {
        /* try individual PDF sources */
      }

      const pdfs = ragSources.filter((s) => s.type === "PDF" && s.status === "ready");
      for (const pdf of pdfs) {
        try {
          const { data, name } = await DataAPI.sourceFilePdf(pdf.id);
          setPdfData(data);
          setPdfName(name);
          return;
        } catch {
          /* try next source */
        }
      }

      setPdfError(
        "No reference PDF found for this course. Your instructor needs to re-upload the PDF so it can display here."
      );
    };

    void load().finally(() => setPdfLoading(false));
  }, [courseId, ragSources]);

  const unitReferencePages = useMemo(
    () => buildUnitReferencePages(concepts, modules, pdfPageCount),
    [concepts, modules, pdfPageCount]
  );

  const referencePage = unitReferencePages[conceptId] ?? 1;

  useEffect(() => {
    if (!courseId || !concept) return;
    if (hasTextBlock && !modeSwitched) {
      setModeContent(null);
      return;
    }
    setModeLoading(true);
    Agents.conceptTutor
      .getModeContent(courseId, concept.name, contentMode, concept.subtitle)
      .then((c) => setModeContent(c as { heading: string; body: string[]; citation?: string }))
      .catch(console.error)
      .finally(() => setModeLoading(false));
  }, [courseId, conceptId, contentMode, concept?.name, concept?.subtitle, hasTextBlock, modeSwitched]);

  useEffect(() => {
    setModeSwitched(false);
    setModeContent(null);
    setMessages([]);
    setChatOpen(false);
  }, [conceptId]);

  const conceptIndex = concepts.findIndex((c) => c.id === conceptId);
  const nextConcept = concepts[conceptIndex + 1];

  const textContent = useMemo(() => {
    if (modeContent && (modeSwitched || !hasTextBlock)) {
      return {
        heading: modeContent.heading,
        body: modeContent.body,
        citation: modeContent.citation,
        excerpt: undefined as string | undefined,
        highlight: undefined as string | undefined,
      };
    }
    if (hasTextBlock && textBlocks[0]) {
      const c = textBlocks[0].content as Record<string, unknown>;
      const body = Array.isArray(c.body) ? (c.body as string[]) : [String(c.body ?? "")].filter(Boolean);
      return {
        heading: (c.heading as string) ?? concept?.name ?? "Lesson",
        body,
        citation: c.citation as string | undefined,
        excerpt: c.sourceExcerpt as string | undefined,
        highlight: c.sourceHighlight as string | undefined,
      };
    }
    return {
      heading: concept?.name ?? "Lesson",
      body: [concept?.subtitle ?? "Loading lesson content…"],
      citation: undefined,
      excerpt: undefined,
      highlight: undefined,
    };
  }, [hasTextBlock, textBlocks, modeContent, modeSwitched, concept]);

  const switchMode = (m: OwlwiseMode) => {
    if (!availableOwlModes.includes(m) || m === owlMode) return;
    logModeSwitch(conceptId, contentMode, OWLWISE_TO_CONTENT[m]);
    setModeSwitched(true);
    setOwlMode(m);
  };

  const handleNext = () => {
    updateLearner({ lastSessionConcept: conceptId });
    if (nextConcept) {
      setActiveConceptId(nextConcept.id);
    } else {
      setScreen("student-reflection");
    }
  };

  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const sendChat = async () => {
    const q = chatInput.trim();
    if (!q || chatBusy || !courseId || !concept) return;
    setChatInput("");
    setMessages((m) => [...m, { from: "user", text: q }]);
    if (!chatOpen) setChatOpen(true);
    setChatBusy(true);
    try {
      const res = await Agents.studentAssistant.respond(
        q,
        { conceptId, conceptName: concept.name, mode: contentMode, onQuiz: false },
        courseId
      );
      setMessages((m) => [...m, { from: "ai", text: res.content }]);
    } catch {
      setMessages((m) => [...m, { from: "ai", text: "Sorry, I couldn't reach the tutor right now." }]);
    } finally {
      setChatBusy(false);
    }
  };

  if (!concept) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-600 mb-4">This course has no lessons yet.</p>
          <button
            type="button"
            onClick={() => setScreen("student-workspace")}
            className="px-6 py-3 bg-[#1a73e8] text-white rounded-xl text-sm font-semibold"
          >
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  const font = MODE_FONT[owlMode];

  return (
    <div className="h-screen flex flex-col bg-[#f4f7fb] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Top bar — Study Fetch style breadcrumb */}
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 z-20">
        <button
          type="button"
          onClick={() => setScreen("student-workspace")}
          className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Back to courses"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
          <span className="text-gray-500 truncate">{courseTitle}</span>
          <ChevronRight size={14} className="text-gray-300 shrink-0" />
          <span className="font-semibold text-gray-800 truncate">{pdfName || concept.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(["interactive", "summary", "narrative"] as OwlwiseMode[]).map((m) => {
            if (!availableOwlModes.includes(m)) return null;
            return (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  owlMode === m ? "bg-gray-100" : "hover:bg-gray-50"
                }`}
                title={m}
              >
                {m === "interactive" && <IconInteractive active={owlMode === m} />}
                {m === "summary" && <IconSummary active={owlMode === m} dark />}
                {m === "narrative" && <IconNarrative active={owlMode === m} dark />}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">
          Unit {conceptIndex + 1} / {concepts.length}
        </span>
      </header>

      {/* Split screen */}
      <div className="flex flex-1 min-h-0">
        {pdfPanelVisible && (
        <div className={`${lessonPanel === "pdf" ? "w-full" : "w-1/2"} min-w-0 flex flex-col border-r border-gray-300`}>
          <ReferencePdfViewer
            fileData={pdfData}
            fileName={pdfName}
            targetPage={referencePage}
            onPageCount={setPdfPageCount}
            loading={pdfLoading}
            error={pdfError}
            onCollapse={collapsePdf}
          />
        </div>
        )}

        {(lessonPanel === "split" || lessonPanel === "notes" || lessonPanel === "transcript") && (
        <div className={`${lessonPanel === "notes" || lessonPanel === "transcript" ? "w-full" : "w-1/2"} min-w-0 flex flex-col bg-white`}>
          {/* Unit toolbar */}
          <div className="shrink-0 border-b border-gray-100 px-5 py-3 flex items-center justify-between bg-[#fafbfc] gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#1a73e8] uppercase tracking-wide">
                Unit {conceptIndex + 1} summary
              </p>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{concept.name}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!pdfPanelVisible && pdfData && (
                <button
                  type="button"
                  onClick={expandPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  style={{ borderColor: "#e5e7eb" }}
                  title="Show reference PDF"
                >
                  <PanelLeftOpen size={14} />
                  Show PDF
                </button>
              )}
              <div className="w-8 h-8 rounded-lg bg-[#34a853] flex items-center justify-center">
                <Check size={16} className="text-white" strokeWidth={3} />
              </div>
            </div>
          </div>

          {/* Scrollable unit blocks */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div
              className="prose prose-sm max-w-none"
              style={font ? { fontFamily: font } : undefined}
            >
              <h2 className="text-base font-bold text-gray-900 mb-2 m-0">{textContent.heading}</h2>
              {modeLoading ? (
                <p className="text-sm text-gray-400 animate-pulse">Rewriting for {owlMode} mode…</p>
              ) : (
                <div className="space-y-3">
                  {textContent.body.map((para, i) => (
                    <p key={i} className="text-[14px] text-gray-700 leading-relaxed m-0">
                      {para.split("**").map((part, j) =>
                        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                      )}
                    </p>
                  ))}
                </div>
              )}
              {textContent.citation && (
                <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                  <BookOpen size={12} />
                  {textContent.citation}
                  {referencePage > 0 && pdfData && (
                    <span className="text-[#1a73e8]">· p. {referencePage}</span>
                  )}
                </p>
              )}
            </div>

            {textContent.excerpt && (
              <blockquote className="text-[13px] text-gray-600 leading-relaxed italic border-l-2 border-[#1a73e8]/40 pl-3 bg-[#f0f6ff] rounded-r-lg py-2 pr-3">
                {textContent.highlight && textContent.excerpt.includes(textContent.highlight)
                  ? (() => {
                      const [before, after] = textContent.excerpt!.split(textContent.highlight!);
                      return (
                        <>
                          {before}
                          <mark className="bg-yellow-200 not-italic rounded px-0.5">{textContent.highlight}</mark>
                          {after}
                        </>
                      );
                    })()
                  : textContent.excerpt}
              </blockquote>
            )}

            {grouped.map((item, i) => {
              if ("blocks" in item && item.type === "MCQGroup") {
                return (
                  <div key={`mcq-${i}`} className="border border-gray-100 rounded-xl p-4 bg-[#fafbfc]">
                    <AdaptiveMCQSession
                      conceptId={conceptId}
                      conceptName={concept.name}
                      initialBlocks={item.blocks}
                    />
                  </div>
                );
              }
              const block = item as ContentBlock;
              if (block.type === "Animation") {
                return <AnimationPanel key={block.id || i} block={block} />;
              }
              return <StudentContentBlock key={block.id || i} block={block} conceptId={conceptId} />;
            })}
          </div>

          <div className="shrink-0 border-t border-gray-100 px-5 py-3 bg-white flex justify-end">
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-semibold rounded-full shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5"
            >
              {nextConcept ? (
                <>
                  Next: {nextConcept.name}
                  <ChevronRight size={16} />
                </>
              ) : (
                "Finish course"
              )}
            </button>
          </div>
        </div>
        )}
      </div>

      <FloatingLessonChat
        open={chatOpen}
        onOpenChange={setChatOpen}
        messages={messages}
        input={chatInput}
        onInputChange={setChatInput}
        onSend={() => void sendChat()}
        busy={chatBusy}
        conceptName={concept.name}
      />

      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white rounded-full shadow-lg border border-gray-200 px-2 py-1.5">
        {([
          ["notes", "Notes"],
          ["transcript", "Transcript"],
          ["pdf", "View PDF"],
          ["split", "Split Screen"],
        ] as const).map(([panel, label]) => (
          <button
            key={panel}
            type="button"
            onClick={() => setLessonPanel(panel)}
            className={`px-4 py-1.5 text-xs font-medium rounded-full flex items-center gap-1 ${
              lessonPanel === panel
                ? "font-semibold text-[#1a73e8] bg-[#e8f0fe]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {panel === "split" && <Columns2 size={12} />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
