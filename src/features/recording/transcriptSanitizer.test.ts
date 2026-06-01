import { hasUsableTranscriptText, sanitizeTranscriptText } from './transcriptSanitizer';

describe('transcript sanitizer', () => {
  it('removes non-speech whisper markers from transcript text', () => {
    expect(sanitizeTranscriptText('[MUSIC] hello [BLANK_AUDIO]')).toBe('hello');
    expect(sanitizeTranscriptText('[SOUND] hello [SOUND EFFECT]')).toBe('hello');
  });

  it('treats pure non-speech markers as unusable transcript text', () => {
    expect(hasUsableTranscriptText('[MUSIC]')).toBe(false);
    expect(hasUsableTranscriptText('[BLANK_AUDIO]')).toBe(false);
    expect(hasUsableTranscriptText('[SOUND]')).toBe(false);
  });
});
