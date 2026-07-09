import type { StudioCourseData } from "./types.js";

/** True when pages only contain default empty blocks (not AI-generated). */
export function isSkeletonStudio(studio: StudioCourseData): boolean {
  if (!studio.pages.length) return false;
  return studio.pages.every((page) => isPlaceholderPage(page));
}

/** Studio page with AI fallback stubs instead of real generated lesson text. */
export function isPlaceholderPage(page: StudioCourseData["pages"][number]): boolean {
  if (page.blocks.length > 6) return false;
  const hook = page.blocks.find((b) => b.type === "hook");
  if (hook?.type === "hook") {
    const genericHook =
      hook.q === "A curious question?" ||
      /^What makes ".+" worth understanding\?$/.test(hook.q) ||
      hook.sub === "Set the scene." ||
      hook.sub === "Let's build intuition from your source material.";
    if (!genericHook) return false;
  }
  const study = page.blocks.find((b) => b.type === "study");
  if (!study || study.type !== "study") return true;
  if (study.title === "New lesson" && study.html.includes("Write the explanation here")) return true;
  if (/Overview of .+ from your uploaded materials/.test(study.html)) return true;
  if (study.html.replace(/<[^>]+>/g, "").trim().length < 80) return true;
  const check = study.check;
  if (check && check.opts.every((o) => /^Option [A-D]$/.test(o))) return true;
  return false;
}

export function isPlaceholderStudio(studio: StudioCourseData): boolean {
  if (!studio.pages.length) return true;
  return studio.pages.every((page) => isPlaceholderPage(page));
}

/** Shorten noisy provider errors for UI toasts and overlays. */
export function friendlyGenerationError(message: string): string {
  if (/credit balance is too low/i.test(message)) {
    return "Anthropic API credits are exhausted. Add credits at console.anthropic.com, then retry generation.";
  }
  const jsonMatch = message.match(/"message"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) return jsonMatch[1];
  return message.replace(/^400\s+/, "").slice(0, 400);
}
