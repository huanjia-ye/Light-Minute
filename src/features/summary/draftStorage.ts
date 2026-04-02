import { getBrowserStorage } from '../../lib/browserStorage';

export interface SummaryDraftSnapshot {
  markdown: string;
  updatedAt: string;
  source: 'manual' | 'generation';
  baseSummaryMarkdown: string;
}

function getSummaryDraftStorageKey(meetingId: string) {
  return `light-meetily:summary-draft:${meetingId}`;
}

export function loadSummaryDraft(meetingId: string) {
  try {
    const rawValue = getBrowserStorage().getItem(getSummaryDraftStorageKey(meetingId));
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
    getBrowserStorage().setItem(getSummaryDraftStorageKey(meetingId), JSON.stringify(draft));
  } catch {
    // Ignore persistence failures so editing remains usable.
  }
}

export function clearSummaryDraft(meetingId: string) {
  try {
    getBrowserStorage().removeItem(getSummaryDraftStorageKey(meetingId));
  } catch {
    // Ignore persistence failures so editing remains usable.
  }
}
