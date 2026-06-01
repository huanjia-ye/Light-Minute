import { REALTIME_DEFAULT_TRANSPORT } from './realtimeConstants';
import { createPingMessage, parseRealtimeIncomingMessage, type RealtimeIncomingMessage, type RealtimeOutgoingMessage } from './realtimeProtocol';
import { RealtimeTransportStartError } from './realtimeStartError';

export interface RealtimeTransportClientOptions {
  wsUrl?: string;
  connectTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  socketFactory?: (url: string) => WebSocket;
}

export interface RealtimeTransportClientHandlers {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onMessage?: (message: RealtimeIncomingMessage) => void;
  onInvalidMessage?: (rawMessage: string) => void;
  onError?: (event: Event) => void;
}

function canUseBrowserLocalRealtimeUrl() {
  return (
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname.toLowerCase())
  );
}

export function resolveBrowserLocalRealtimeHealthUrl() {
  if (canUseBrowserLocalRealtimeUrl()) {
    return '/__light_realtime/health';
  }

  return 'http://127.0.0.1:8180/__light_realtime/health';
}

export function resolveBrowserLocalRealtimeCapabilitiesUrl() {
  if (canUseBrowserLocalRealtimeUrl()) {
    return '/__light_realtime/capabilities';
  }

  return 'http://127.0.0.1:8180/__light_realtime/capabilities';
}

export function resolveBrowserLocalRealtimeWsUrl() {
  if (typeof window !== 'undefined' && canUseBrowserLocalRealtimeUrl()) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/__light_realtime/ws`;
  }

  return 'ws://127.0.0.1:8180/__light_realtime/ws';
}

export async function fetchRealtimeHealth(url = resolveBrowserLocalRealtimeHealthUrl()) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Realtime health check failed with status ${response.status}.`);
  }

  return response.json() as Promise<{
    status: string;
    backendReachable: boolean;
    model: string;
    wsPath: string;
    supportedLanguages: string[];
  }>;
}

export async function fetchRealtimeCapabilities(url = resolveBrowserLocalRealtimeCapabilitiesUrl()) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Realtime capabilities check failed with status ${response.status}.`);
  }

  return response.json() as Promise<{
    protocolVersion: string;
    audioFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
    supportsPartials: boolean;
    supportsFinals: boolean;
    supportedLanguages: string[];
    model?: string;
  }>;
}

export class RealtimeTransportClient {
  private socket: WebSocket | null = null;
  private readonly handlers: RealtimeTransportClientHandlers;
  private readonly options: Required<Pick<RealtimeTransportClientOptions, 'connectTimeoutMs' | 'heartbeatIntervalMs'>> &
    Pick<RealtimeTransportClientOptions, 'wsUrl' | 'socketFactory'>;
  private connectTimeoutId: number | null = null;
  private heartbeatId: number | null = null;
  private activeSessionId: string | null = null;

  constructor(handlers: RealtimeTransportClientHandlers = {}, options: RealtimeTransportClientOptions = {}) {
    this.handlers = handlers;
    this.options = {
      wsUrl: options.wsUrl ?? resolveBrowserLocalRealtimeWsUrl(),
      socketFactory: options.socketFactory,
      connectTimeoutMs: options.connectTimeoutMs ?? REALTIME_DEFAULT_TRANSPORT.connectTimeoutMs,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? REALTIME_DEFAULT_TRANSPORT.heartbeatIntervalMs,
    };
  }

  get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect() {
    if (this.isConnected) {
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      return;
    }

    const socket = this.options.socketFactory
      ? this.options.socketFactory(this.options.wsUrl ?? resolveBrowserLocalRealtimeWsUrl())
      : new WebSocket(this.options.wsUrl ?? resolveBrowserLocalRealtimeWsUrl());

    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const clearConnectTimeout = () => {
        if (this.connectTimeoutId !== null) {
          window.clearTimeout(this.connectTimeoutId);
          this.connectTimeoutId = null;
        }
      };

      this.connectTimeoutId = window.setTimeout(() => {
        clearConnectTimeout();
        reject(new RealtimeTransportStartError('Realtime transport connection timed out.'));
      }, this.options.connectTimeoutMs);

      socket.onopen = () => {
        clearConnectTimeout();
        this.startHeartbeat();
        this.handlers.onOpen?.();
        resolve();
      };

      socket.onmessage = (event) => {
        const rawData = typeof event.data === 'string' ? event.data : String(event.data);
        const message = parseRealtimeIncomingMessage(rawData);
        if (!message) {
          this.handlers.onInvalidMessage?.(rawData);
          return;
        }

        if ('sessionId' in message && typeof message.sessionId === 'string') {
          this.activeSessionId = message.sessionId;
        }

        this.handlers.onMessage?.(message);
      };

      socket.onerror = (event) => {
        this.handlers.onError?.(event);
      };

      socket.onclose = (event) => {
        clearConnectTimeout();
        this.clearHeartbeat();
        this.handlers.onClose?.(event);
      };
    });
  }

  send(message: RealtimeOutgoingMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Realtime transport socket is not connected.');
    }

    if ('sessionId' in message) {
      this.activeSessionId = message.sessionId;
    } else if (message.type === 'session.start') {
      this.activeSessionId = message.session.sessionId;
    }

    this.socket.send(JSON.stringify(message));
  }

  close(code?: number, reason?: string) {
    this.clearHeartbeat();
    if (!this.socket) {
      return;
    }

    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close(code, reason);
    }
    this.socket = null;
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatId = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.activeSessionId) {
        return;
      }

      this.socket.send(JSON.stringify(createPingMessage(this.activeSessionId)));
    }, this.options.heartbeatIntervalMs);
  }

  private clearHeartbeat() {
    if (this.heartbeatId !== null) {
      window.clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
  }
}
