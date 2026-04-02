import {
  clearSummaryDraft,
  loadSummaryDraft,
  saveSummaryDraft,
} from './draftStorage';

describe('summary draft storage', () => {
  it('saves and loads summary drafts by meeting id', () => {
    saveSummaryDraft('meeting-draft', {
      markdown: '# Draft\n\nRecovered content.',
      updatedAt: '2026-03-23T09:00:00.000Z',
      source: 'generation',
      baseSummaryMarkdown: '# Saved',
    });

    expect(loadSummaryDraft('meeting-draft')).toEqual({
      markdown: '# Draft\n\nRecovered content.',
      updatedAt: '2026-03-23T09:00:00.000Z',
      source: 'generation',
      baseSummaryMarkdown: '# Saved',
    });
  });

  it('clears summary drafts', () => {
    saveSummaryDraft('meeting-clear', {
      markdown: '# Draft',
      updatedAt: '2026-03-23T09:00:00.000Z',
      source: 'manual',
      baseSummaryMarkdown: '',
    });

    clearSummaryDraft('meeting-clear');

    expect(loadSummaryDraft('meeting-clear')).toBeNull();
  });
});
