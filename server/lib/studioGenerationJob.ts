import { supabaseAdmin } from "./supabase.js";
import { formatErrorMessage } from "./errors.js";

export type PersistedStudioGenerationJob = {
  status: "idle" | "running" | "done" | "error";
  progress?: string;
  moduleIndex?: number;
  moduleTotal?: number;
  error?: string;
  startedAt?: number;
};

export async function readStudioGenerationJob(
  courseId: string
): Promise<PersistedStudioGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("studio_generation")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    if (/studio_generation|column/i.test(error.message)) return null;
    throw new Error(formatErrorMessage(error));
  }

  const raw = data?.studio_generation;
  if (!raw || typeof raw !== "object") return null;
  return raw as PersistedStudioGenerationJob;
}

export async function writeStudioGenerationJob(
  courseId: string,
  job: PersistedStudioGenerationJob
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("courses")
    .update({ studio_generation: job })
    .eq("id", courseId);

  if (error) {
    if (/studio_generation|column/i.test(error.message)) {
      console.warn("[studio] studio_generation column missing — run migration 007_studio_generation_job.sql");
      return;
    }
    throw new Error(formatErrorMessage(error));
  }
}
