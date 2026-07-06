import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import type { ContentMode } from "../types";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { blocksForConcept } from "../lib/content-blocks";
import {
  CONTENT_TO_OWLWISE,
  OWLWISE_TO_CONTENT,
  type OwlwiseMode,
} from "../constants/owlwiseTheme";
import { FloatingLessonChat } from "../components/FloatingLessonChat";
import { LessonShell } from "../components/student-lesson/LessonShell";
import { HookStep } from "../components/student-lesson/steps/HookStep";
import { deriveHookContent } from "../components/student-lesson/hookContent";
import { BuildIntuitionStep } from "../components/student-lesson/steps/BuildIntuitionStep";
import { StudyStep } from "../components/student-lesson/steps/StudyStep";
import { LessonQuizStep } from "../components/student-lesson/steps/LessonQuizStep";
import { LessonFlashcardsStep } from "../components/student-lesson/steps/LessonFlashcardsStep";
import { LessonReflectionStep } from "../components/student-lesson/steps/LessonReflectionStep";
import { LessonUnitTestStep } from "../components/student-lesson/steps/LessonUnitTestStep";
import { UnitCompleteModal } from "../components/student-lesson/UnitCompleteModal";
import {
  LESSON_STEP_TAGS,
  getLessonBlocks,
  mcqFromBlock,
  flashcardsFromBlock,
  testFromBlock,
} from "../components/student-lesson/lessonBlocks";
import type { LessonMcq } from "../components/student-lesson/steps/LessonQuizStep";
import {
  sectionsFromTextContent,
  isPlaceholderMcq,
  type StudySection,
} from "../lib/study-sections";
import type { TestBlockContent } from "../types";

const LESSON_STEP_COUNT = 7;

function mcqsNeedRegeneration(mcqs: LessonMcq[]): boolean {
  return !mcqs.length || mcqs.some((m) => isPlaceholderMcq(m.options));
}

function testNeedsRegeneration(content: TestBlockContent | null): boolean {
  if (!content?.questions?.length) return true;
  return content.questions.some((q) => isPlaceholderMcq(q.options));
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
    modules,
    conceptAvailability,
    updateLearner,
    completeReflection,
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
    sections?: StudySection[];
    citation?: string;
  } | null>(null);
  const [modeLoading, setModeLoading] = useState(false);

  const conceptBlocks = useMemo(
    () => (concept ? blocksForConcept(modules, conceptId, concept.name) : []),
    [modules, conceptId, concept]
  );

  const textBlocks = conceptBlocks.filter((b) => b.type === "Text");
  const hasTextBlock = textBlocks.length > 0;
  const lessonBlocks = useMemo(() => getLessonBlocks(conceptBlocks), [conceptBlocks]);
  const seedMcqs = useMemo(
    () => lessonBlocks.mcqs.map(mcqFromBlock).filter((m): m is NonNullable<typeof m> => m !== null),
    [lessonBlocks.mcqs]
  );
  const flashcards = useMemo(() => flashcardsFromBlock(lessonBlocks.flashcard), [lessonBlocks.flashcard]);
  const testContent = useMemo(() => testFromBlock(lessonBlocks.test), [lessonBlocks.test]);

  useEffect(() => {
    if (!courseId || !concept) return;
    if (hasTextBlock && !modeSwitched) {
      setModeContent(null);
      return;
    }
    setModeLoading(true);
    Agents.conceptTutor
      .getModeContent(courseId, concept.name, contentMode, concept.subtitle)
      .then((c) =>
        setModeContent(
          c as { heading: string; body: string[]; sections?: StudySection[]; citation?: string }
        )
      )
      .catch(console.error)
      .finally(() => setModeLoading(false));
  }, [courseId, conceptId, contentMode, concept?.name, concept?.subtitle, hasTextBlock, modeSwitched]);

  const [lessonStep, setLessonStep] = useState(0);
  const [quizMcqs, setQuizMcqs] = useState<LessonMcq[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [liveTestContent, setLiveTestContent] = useState<TestBlockContent | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [unitTestDone, setUnitTestDone] = useState(false);
  const [reflectionText, setReflectionText] = useState("");
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setModeSwitched(false);
    setModeContent(null);
    setMessages([]);
    setChatOpen(false);
    setLessonStep(0);
    setQuizDone(false);
    setQuizMcqs([]);
    setLiveTestContent(null);
    setUnitTestDone(false);
    setReflectionText("");
    setShowCompleteModal(false);
  }, [conceptId]);

  const conceptIndex = concepts.findIndex((c) => c.id === conceptId);
  const nextConcept = concepts[conceptIndex + 1];

  const textContent = useMemo(() => {
    if (modeContent && (modeSwitched || !hasTextBlock)) {
      return {
        heading: modeContent.heading,
        body: modeContent.body,
        sections: modeContent.sections?.length
          ? modeContent.sections
          : sectionsFromTextContent(
              { body: modeContent.body },
              concept?.name ?? "Lesson"
            ),
      };
    }
    if (hasTextBlock && textBlocks[0]) {
      const c = textBlocks[0].content as Record<string, unknown>;
      const sections = sectionsFromTextContent(c, concept?.name ?? "Lesson");
      const body = sections.map((s) => s.text);
      return {
        heading: (c.heading as string) ?? concept?.name ?? "Lesson",
        body,
        sections,
      };
    }
    return {
      heading: concept?.name ?? "Lesson",
      body: [concept?.subtitle ?? "Loading lesson content…"],
      sections: sectionsFromTextContent(
        { body: [concept?.subtitle ?? "Loading lesson content…"] },
        concept?.name ?? "Lesson"
      ),
    };
  }, [hasTextBlock, textBlocks, modeContent, modeSwitched, concept]);

  useEffect(() => {
    if (lessonStep !== 3 || !courseId || !concept) return;
    if (!mcqsNeedRegeneration(seedMcqs)) {
      setQuizMcqs(seedMcqs);
      return;
    }
    let cancelled = false;
    setQuizLoading(true);
    Agents.conceptTutor
      .generateLessonQuizSet(courseId, concept.name)
      .then((res) => {
        if (cancelled) return;
        const questions = (res.questions ?? []).map((q, i) => ({
          id: q.id ?? `gen-${i}`,
          question: q.question,
          options: q.options,
          correct: q.correct,
          hints: q.hints,
          explanation: q.explanation,
        }));
        setQuizMcqs(questions.length ? questions : seedMcqs);
      })
      .catch(() => {
        if (!cancelled) setQuizMcqs(seedMcqs);
      })
      .finally(() => {
        if (!cancelled) setQuizLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonStep, courseId, concept?.name, seedMcqs]);

  useEffect(() => {
    if (lessonStep !== 6 || !courseId || !concept) return;
    if (!testNeedsRegeneration(testContent)) {
      setLiveTestContent(testContent);
      return;
    }
    let cancelled = false;
    setTestLoading(true);
    Agents.conceptTutor
      .generateTest(courseId, concept.name)
      .then((res) => {
        if (cancelled) return;
        setLiveTestContent(res as TestBlockContent);
      })
      .catch(() => {
        if (!cancelled) setLiveTestContent(testContent);
      })
      .finally(() => {
        if (!cancelled) setTestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonStep, courseId, concept?.name, testContent]);

  const activeQuizMcqs = quizMcqs.length ? quizMcqs : seedMcqs;
  const activeTestContent = liveTestContent ?? testContent;

  const switchMode = (m: OwlwiseMode) => {
    if (!availableOwlModes.includes(m) || m === owlMode) return;
    logModeSwitch(conceptId, contentMode, OWLWISE_TO_CONTENT[m]);
    setModeSwitched(true);
    setOwlMode(m);
  };

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

  const saveReflection = useCallback(
    async (text: string) => {
      if (!courseId || !conceptId || !text.trim()) return;
      try {
        await Agents.reflection.submitSessionReflection(conceptId, [text], courseId);
        completeReflection(conceptId);
      } catch {
        /* keep local text */
      }
    },
    [courseId, conceptId, completeReflection]
  );

  const finishUnit = () => {
    updateLearner({ lastSessionConcept: conceptId });
    setShowCompleteModal(false);
    if (nextConcept) {
      setActiveConceptId(nextConcept.id);
    } else {
      setScreen("student-workspace");
    }
  };

  const handleContinue = () => {
    if (lessonStep === 5 && reflectionText.trim()) {
      void saveReflection(reflectionText);
    }
    if (lessonStep === 6 && unitTestDone) {
      setShowCompleteModal(true);
      return;
    }
    if (lessonStep < LESSON_STEP_COUNT - 1) {
      setLessonStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (lessonStep === 0) {
      setScreen("student-workspace");
      return;
    }
    setLessonStep((s) => s - 1);
  };

  const backLabel = lessonStep === 0 ? "Exit lesson" : "Back";

  if (!concept) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-zinc-400 mb-4">This course has no lessons yet.</p>
          <button
            type="button"
            onClick={() => setScreen("student-workspace")}
            className="px-6 py-3 bg-zinc-200 text-black rounded-full text-sm font-semibold"
          >
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  const conceptNav = useMemo(
    () =>
      concepts.map((c) => {
        const mastery = learner.conceptMastery[c.id];
        const done = mastery === "mastered" || mastery === "understood";
        return {
          id: c.id,
          name: c.name,
          status:
            c.id === conceptId ? ("current" as const) : done ? ("completed" as const) : ("upcoming" as const),
        };
      }),
    [concepts, conceptId, learner.conceptMastery]
  );

  const hookContent = useMemo(() => {
    const rawBody = hasTextBlock
      ? (() => {
          const c = textBlocks[0].content as Record<string, unknown>;
          return Array.isArray(c.body) ? (c.body as string[]) : [String(c.body ?? "")].filter(Boolean);
        })()
      : textContent.body;
    const rawHeading = hasTextBlock
      ? String((textBlocks[0].content as Record<string, unknown>).heading ?? concept?.name ?? "")
      : textContent.heading;
    return deriveHookContent({
      conceptName: concept?.name ?? "this topic",
      subtitle: concept?.subtitle,
      heading: rawHeading,
      body: rawBody,
    });
  }, [hasTextBlock, textBlocks, textContent, concept]);

  const animationContent = lessonBlocks.animation?.content as Record<string, unknown> | undefined;
  const buildTitle =
    (typeof animationContent?.description === "string" && animationContent.description) ||
    `Watch how ${concept.name.toLowerCase()} works`;
  const buildBody =
    textContent.body[0]?.slice(0, 200) ||
    concept.subtitle ||
    "See the core idea in action before we dive deeper.";

  const stepTag = LESSON_STEP_TAGS[lessonStep] ?? "Lesson";
  const isLightStep = lessonStep === 6;
  const footerHint =
    lessonStep === 3 && !quizDone
      ? "Finish the quiz to continue"
      : lessonStep === 6 && !unitTestDone
        ? "Complete the unit test to continue"
        : "Ready when you are";
  const continueDisabled =
    (lessonStep === 3 && !quizDone) || (lessonStep === 6 && !unitTestDone);

  const chat = (
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
  );

  let stepContent: ReactNode;
  switch (lessonStep) {
    case 0:
      stepContent = <HookStep headline={hookContent.headline} subtext={hookContent.subtext} />;
      break;
    case 1:
      stepContent = (
        <BuildIntuitionStep
          title={buildTitle}
          body={buildBody}
          animationBlock={lessonBlocks.animation}
        />
      );
      break;
    case 2:
      stepContent = (
        <StudyStep
          conceptName={concept.name}
          heading={textContent.heading}
          sections={textContent.sections}
          loading={modeLoading}
          mode={owlMode}
          availableModes={availableOwlModes}
          onModeChange={switchMode}
        />
      );
      break;
    case 3:
      stepContent = quizLoading ? (
        <p className="text-zinc-500 text-sm text-center animate-pulse">
          Building quiz questions from your sources…
        </p>
      ) : (
        <LessonQuizStep
          mcqs={activeQuizMcqs}
          conceptId={conceptId}
          conceptName={concept.name}
          onComplete={() => setQuizDone(true)}
        />
      );
      break;
    case 4:
      stepContent = <LessonFlashcardsStep cards={flashcards} />;
      break;
    case 5:
      stepContent = (
        <LessonReflectionStep
          value={reflectionText}
          onChange={setReflectionText}
          onSave={(t) => void saveReflection(t)}
        />
      );
      break;
    case 6:
      stepContent = testLoading ? (
        <p className="text-zinc-500 text-sm text-center animate-pulse">
          Building unit test from your sources…
        </p>
      ) : activeTestContent ? (
        <LessonUnitTestStep
          content={activeTestContent}
          onSubmitted={() => setUnitTestDone(true)}
        />
      ) : (
        <p className="text-zinc-500 text-sm text-center">No unit test — hit Continue to finish.</p>
      );
      break;
    default:
      stepContent = null;
  }

  useEffect(() => {
    if (lessonStep === 3 && !quizLoading && !activeQuizMcqs.length) setQuizDone(true);
    if (lessonStep === 6 && !testLoading && !activeTestContent) setUnitTestDone(true);
  }, [lessonStep, quizLoading, testLoading, activeQuizMcqs.length, activeTestContent]);

  return (
    <>
      <LessonShell
        concepts={conceptNav}
        stepIndex={lessonStep}
        totalSteps={LESSON_STEP_COUNT}
        stepTag={stepTag}
        theme={isLightStep ? "light" : "dark"}
        footerHint={footerHint}
        onContinue={handleContinue}
        continueDisabled={continueDisabled}
        onBack={handleBack}
        backLabel={backLabel}
        onChatOpen={() => setChatOpen(true)}
        mainClassName={
          lessonStep === 2
            ? "flex-1 flex flex-col px-6 sm:px-10 py-6 min-h-0 overflow-y-auto"
            : undefined
        }
      >
        {stepContent}
      </LessonShell>
      {chat}
      {showCompleteModal && (
        <UnitCompleteModal
          conceptName={concept.name}
          nextConceptName={nextConcept?.name}
          onContinue={finishUnit}
        />
      )}
    </>
  );
}
