/**
 * Verdex — template language filter.
 *
 * Built-in templates follow the id convention `<domain>-<slug>-<lang>` where
 * <lang> is "en" or "zh". User-created templates (via genId / random UUID)
 * have no such suffix and are always shown regardless of UI language.
 *
 * Use `filterByLanguage` to show only templates matching the current UI
 * language in both the management UI (Settings) and the selection dropdowns
 * (ConfigBar), so users aren't flooded with duplicate bilingual entries.
 */

/** A template with an `id` field (RoleTemplate / JudgePromptTemplate / ExtractSchemaTemplate). */
interface HasId {
  id: string;
}

/**
 * True if the template is a user-created one (no -en/-zh suffix) OR matches
 * the given language.
 */
export function matchesLanguage(t: HasId, lang: "en" | "zh"): boolean {
  // User-created ids (UUIDs / genId) don't end in -en/-zh → always show.
  if (!t.id.endsWith("-en") && !t.id.endsWith("-zh")) return true;
  return t.id.endsWith(`-${lang}`);
}

/** Filter a template list to the current UI language (+ user-created ones). */
export function filterByLanguage<T extends HasId>(templates: T[], lang: "en" | "zh"): T[] {
  return templates.filter((t) => matchesLanguage(t, lang));
}
