import type { SessionRejectedMessage } from './realtimeProtocol';

type RealtimeSessionRejectionReason = SessionRejectedMessage['reason'];

function formatRealtimeSessionRejectedMessage(
  reason: RealtimeSessionRejectionReason,
  language: string,
) {
  switch (reason.code) {
    case 'unsupported_language':
      return `Local realtime whisper does not support ${language} in the current runtime.`;
    case 'backend_unavailable':
      return 'Local realtime whisper backend is not reachable.';
    case 'model_unavailable':
      return 'Local realtime whisper model is not available.';
    case 'bad_request':
    default:
      return reason.message || 'Realtime session start was rejected.';
  }
}

export class RealtimeSessionRejectedError extends Error {
  readonly code: RealtimeSessionRejectionReason['code'];
  readonly recoverable: boolean;
  readonly language: string;

  constructor(reason: RealtimeSessionRejectionReason, language: string) {
    super(formatRealtimeSessionRejectedMessage(reason, language));
    this.name = 'RealtimeSessionRejectedError';
    this.code = reason.code;
    this.recoverable = reason.recoverable;
    this.language = language;
  }
}

export function isRealtimeSessionRejectedError(
  error: unknown,
): error is RealtimeSessionRejectedError {
  return error instanceof RealtimeSessionRejectedError;
}

export class RealtimeTransportStartError extends Error {
  readonly recoverable = true;

  constructor(message: string) {
    super(message);
    this.name = 'RealtimeTransportStartError';
  }
}

export function isRealtimeTransportStartError(
  error: unknown,
): error is RealtimeTransportStartError {
  return error instanceof RealtimeTransportStartError;
}

export function isRealtimeStartFallbackError(error: unknown) {
  return isRealtimeSessionRejectedError(error) || isRealtimeTransportStartError(error);
}
