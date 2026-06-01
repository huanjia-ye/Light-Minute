const KNOWN_NON_SPEECH_TOKEN_PATTERN =
  /\[\s*(music|applause|laughter|noise|silence|blank_audio|sound)\s*\]/giu;
const GENERIC_UPPERCASE_BRACKET_TOKEN_PATTERN = /\[\s*[A-Z][A-Z_\-\s]{1,31}\s*\]/gu;

export function sanitizeTranscriptText(text: string) {
  return text
    .replace(KNOWN_NON_SPEECH_TOKEN_PATTERN, ' ')
    .replace(GENERIC_UPPERCASE_BRACKET_TOKEN_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function hasUsableTranscriptText(text: string) {
  const sanitized = sanitizeTranscriptText(text);

  if (!sanitized) {
    return false;
  }

  return /[\p{L}\p{N}\p{Script=Han}]/u.test(sanitized);
}
