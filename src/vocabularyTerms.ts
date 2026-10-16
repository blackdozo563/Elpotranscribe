export const cleanTerms = (text: string) => appendTerms([], text).terms;
/** Keep spelling and order; duplicate matching follows the saved profile format. */
export function appendTerms(existing: string[], text: string) {
  const terms = [...existing],
    duplicates: string[] = [];
  const seen = new Set(existing.map((term) => term.toLocaleLowerCase()));
  for (const part of text.split(/\r?\n/u)) {
    const term = part.trim();
    if (!term) continue;
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) duplicates.push(term);
    else {
      terms.push(term);
      seen.add(key);
    }
  }
  return { terms, duplicates };
}
