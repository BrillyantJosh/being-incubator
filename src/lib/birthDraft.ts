// Draft persistence for the /birth flow.
//
// Each owner gets their own seed draft (name, language, vision) under
// the key `being_incubator_draft:<owner_hex>`. The flow auto-saves on
// every change so visitors can leave the chamber and resume later
// without losing their writing. WIF and identity scans are intentionally
// NOT persisted — those must be re-scanned for security.

const PREFIX = 'being_incubator_draft:';

export type DraftStep = 'name' | 'language' | 'vision';

export type BirthDraft = {
  step: DraftStep;
  name: string;
  language: string;
  vision: string;
  savedAt: number;
};

const PERSISTABLE_STEPS: readonly DraftStep[] = ['name', 'language', 'vision'];

export function loadBirthDraft(ownerHex: string): BirthDraft | null {
  try {
    const raw = localStorage.getItem(PREFIX + ownerHex);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!PERSISTABLE_STEPS.includes(parsed.step)) return null;
    return {
      step: parsed.step,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      language: typeof parsed.language === 'string' ? parsed.language : 'english',
      vision: typeof parsed.vision === 'string' ? parsed.vision : '',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveBirthDraft(
  ownerHex: string,
  draft: { step: DraftStep; name: string; language: string; vision: string },
): number {
  const savedAt = Date.now();
  try {
    localStorage.setItem(PREFIX + ownerHex, JSON.stringify({ ...draft, savedAt }));
  } catch {
    // ignore quota / privacy errors — silent failure is fine for a draft
  }
  return savedAt;
}

export function clearBirthDraft(ownerHex: string): void {
  try {
    localStorage.removeItem(PREFIX + ownerHex);
  } catch {
    // ignore
  }
}

export function hasBirthDraft(ownerHex: string): boolean {
  return loadBirthDraft(ownerHex) !== null;
}
