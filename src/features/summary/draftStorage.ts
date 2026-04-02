import { getBrowserStorage } from '../../lib/browserStorage';

export interface SummaryDraftSnapshot {
  markdown: string;
  updatedAt: string;
  source: 'manual' | 'generation';
  baseSummaryMarkdown: string;
}

const SUMMARY_DRAFT_STORAGE_PREFIX = 'light-minute:summary-draft:';
const LEGACY_SUMMARY_DRAFT_STORAGE_PREFIX = 'light-meetily:summary-draft:';

function getSummaryDraftStorageKey(meetingId: string) {
  return `${SUMMARY_DRAFT_STORAGE_PREFIX}${meetingId}`;
}

function getLegacySummaryDraftStorageKey(meetingId: string) {
  return `${LEGACY_SUMMARY_DRAFT_STORAGE_PREFIX}${meetingId}`;
}

export function loadSummaryDraft(meetingId: string) {
  try {
    const storage = getBrowserStorage();
    const rawValue =
      storage.getItem(getSummaryDraftStorageKey(meetingId)) ??
      storage.getItem(getLegacySummaryDraftStorageKey(meetingId));
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<SummaryDraftSnapshot> | null;
    if (!parsedValue || typeof parsedValue.markdown !== 'string') {
      return null;
    }

    return {
      markdown: parsedValue.markdown,
      updatedAt:
        typeof parsedValue.updatedAt === 'string'
          ? parsedValue.updatedAt
          : new Date().toISOString(),
      source: parsedValue.source === 'generation' ? 'generation' : 'manual',
      baseSummaryMarkdown:
        typeof parsedValue.baseSummaryMarkdown === 'string' ? parsedValue.baseSummaryMarkdown : '',
    } satisfies SummaryDraftSnapshot;
  } catch {
    return null;
  }
}

export function saveSummaryDraft(meetingId: string, draft: SummaryDraftSnapshot) {
  try {
    const storage = getBrowserStorage();
    storage.setItem(getSummaryDraftStorageKey(meetingId), JSON.stringify(draft));
    storage.removeItem(getLegacySummaryDraftStorageKey(meetingId));
  } catch {
    // Ignore persistence failures so editing remains usable.
  }
}

export function clearSummaryDraft(meetingId: string) {
  try {
    const storage = getBrowserStorage();
    storage.removeItem(getSummaryDraftStorageKey(meetingId));
    storage.removeItem(getLegacySummaryDraftStorageKey(meetingId));
  } catch {
    // Ignore persistence failures so editing remains usable.
  }
}
