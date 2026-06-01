import { createServer } from 'node:http';
import process from 'node:process';
import { WebSocketServer } from 'ws';
import {
  RealtimeSessionProcessor,
  transcribePartialWithLocalWhisper,
  transcribeWithLocalWhisper,
} from './local-realtime-asr-server.helpers.mjs';
import { getWhisperRuntimeProfile } from './local-whisper-runtime-config.mjs';

const host = process.env.LIGHT_REALTIME_HOST || '127.0.0.1';
const port = Number(process.env.LIGHT_REALTIME_PORT || '8180');
const requestPrefix = '/__light_realtime';
const realtimeWsPath = `${requestPrefix}/ws`;
const realtimeHealthPath = `${requestPrefix}/health`;
const realtimeCapabilitiesPath = `${requestPrefix}/capabilities`;
const whisperBaseUrl = process.env.LIGHT_REALTIME_WHISPER_BASE_URL || 'http://127.0.0.1:8178';
const configuredModel = process.env.LIGHT_REALTIME_MODEL || 'whisper-small-multilingual';
const configuredModelProfile = getWhisperRuntimeProfile(configuredModel);
const supportedLanguages = (
  process.env.LIGHT_REALTIME_SUPPORTED_LANGUAGES ||
  configuredModelProfile.supportedLanguages.join(',')
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function sendSocketMessage(socket, payload) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

async function isWhisperReachable() {
  try {
    const response = await fetch(`${whisperBaseUrl}/`);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function createSocketState() {
  return {
    sessions: new Map(),
  };
}

function createErrorEvent(sessionId, message, source = 'transport', recoverable = true) {
  return {
    type: 'asr.event',
    event: {
      type: 'error',
      sessionId,
      groupId: `error:${sessionId}`,
      utteranceId: `error:${sessionId}`,
      revision: 0,
      startMs: 0,
      endMs: 0,
      text: '',
      error: {
        source,
        message,
        recoverable,
      },
    },
  };
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL' });
    return;
  }

  const requestUrl = new URL(request.url, `http://${host}:${port}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    });
    response.end();
    return;
  }

  if (request.method !== 'GET') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  if (requestUrl.pathname === '/health' || requestUrl.pathname === realtimeHealthPath) {
    const backendReachable = await isWhisperReachable();
    sendJson(response, 200, {
      status: 'ok',
      backendReachable,
      model: configuredModel,
      wsPath: realtimeWsPath,
      supportedLanguages,
    });
    return;
  }

  if (requestUrl.pathname === realtimeCapabilitiesPath) {
    sendJson(response, 200, {
      protocolVersion: 'v1',
      audioFormat: {
        encoding: 'pcm_s16le',
        sampleRate: 16000,
        channels: 1,
      },
      supportsPartials: true,
      supportsFinals: true,
      supportedLanguages,
      model: configuredModel,
    });
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

const socketState = new WeakMap();
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (socket) => {
  const state = createSocketState();
  socketState.set(socket, state);

  socket.on('message', async (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      sendSocketMessage(
        socket,
        createErrorEvent('unknown-session', 'Realtime adapter received invalid JSON.'),
      );
      return;
    }

    const currentState = socketState.get(socket);
    if (!currentState) {
      return;
    }

    if (message.type === 'ping') {
      sendSocketMessage(socket, {
        type: 'pong',
        sessionId: message.sessionId,
        timestamp: message.timestamp ?? Date.now(),
      });
      return;
    }

    if (message.type === 'session.start') {
      const requestedLanguage = message.session?.language;
      const sessionId = message.session?.sessionId;
      const audioFormat = message.audioFormat;

      if (
        !sessionId ||
        !requestedLanguage ||
        message.protocolVersion !== 'v1' ||
        audioFormat?.encoding !== 'pcm_s16le' ||
        Number(audioFormat?.sampleRate) !== 16000 ||
        Number(audioFormat?.channels) !== 1
      ) {
        sendSocketMessage(socket, {
          type: 'session.rejected',
          sessionId: sessionId ?? 'unknown-session',
          transportStatus: 'open',
          reason: {
            code: 'bad_request',
            message: 'session.start payload is invalid.',
            recoverable: true,
          },
        });
        return;
      }

      if (currentState.sessions.has(sessionId)) {
        sendSocketMessage(socket, {
          type: 'session.rejected',
          sessionId,
          transportStatus: 'open',
          reason: {
            code: 'bad_request',
            message: 'sessionId must be unique within the current WebSocket connection.',
            recoverable: true,
          },
        });
        return;
      }

      if (!supportedLanguages.includes(requestedLanguage)) {
        sendSocketMessage(socket, {
          type: 'session.rejected',
          sessionId,
          transportStatus: 'open',
          reason: {
            code: 'unsupported_language',
            message: `language ${requestedLanguage} is not supported`,
            recoverable: true,
          },
        });
        return;
      }

      const backendReachable = await isWhisperReachable();
      if (!backendReachable) {
        sendSocketMessage(socket, {
          type: 'session.rejected',
          sessionId,
          transportStatus: 'open',
          reason: {
            code: 'backend_unavailable',
            message: 'local whisper backend is not reachable',
            recoverable: true,
          },
        });
        return;
      }

      currentState.sessions.set(sessionId, new RealtimeSessionProcessor({
        sessionId,
        language: requestedLanguage,
        enablePartials: message.options?.enablePartials !== false,
        emit: (payload) => {
          sendSocketMessage(socket, payload);
        },
        transcribeUtterance: (input) =>
          transcribeWithLocalWhisper({
            whisperBaseUrl,
            ...input,
          }),
        transcribePartialUtterance: (input) =>
          transcribePartialWithLocalWhisper({
            whisperBaseUrl,
            ...input,
          }),
      }));

      sendSocketMessage(socket, {
        type: 'session.started',
        sessionId,
        transportStatus: 'open',
        capabilities: {
          supportsPartials: true,
          supportsFinals: true,
          acceptedLanguage: requestedLanguage,
        },
      });
      return;
    }

    const sessionId = message.sessionId;
    const session = sessionId ? currentState.sessions.get(sessionId) : null;

    if (!sessionId || !session) {
      sendSocketMessage(
        socket,
        createErrorEvent(sessionId ?? 'unknown-session', 'Session was not started or has already ended.'),
      );
      return;
    }

    if (message.type === 'audio.chunk') {
      try {
        session.acceptAudioChunk(message);
      } catch (error) {
        sendSocketMessage(
          socket,
          createErrorEvent(
            sessionId,
            error instanceof Error ? error.message : 'Audio chunk could not be processed.',
          ),
        );
      }
      return;
    }

    if (message.type === 'session.pause') {
      await session.pause();
      return;
    }

    if (message.type === 'session.resume') {
      session.resume();
      return;
    }

    if (message.type === 'session.abort') {
      session.abort();
      currentState.sessions.delete(sessionId);
      sendSocketMessage(socket, {
        type: 'transport.state',
        sessionId,
        status: 'closed',
      });
      return;
    }

    if (message.type === 'session.stop') {
      try {
        await session.stop();
      } catch (error) {
        sendSocketMessage(
          socket,
          createErrorEvent(
            sessionId,
            error instanceof Error ? error.message : 'Realtime session could not be finalized.',
            'asr',
          ),
        );
        sendSocketMessage(socket, {
          type: 'transport.state',
          sessionId,
          status: 'closed',
        });
      } finally {
        currentState.sessions.delete(sessionId);
      }
      return;
    }

    sendSocketMessage(
      socket,
      createErrorEvent(sessionId, `Unsupported realtime adapter message: ${message.type}`),
    );
  });
});

server.on('upgrade', (request, socket, head) => {
  if (!request.url) {
    socket.destroy();
    return;
  }

  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  if (requestUrl.pathname !== realtimeWsPath) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (websocket) => {
    wss.emit('connection', websocket, request);
  });
});

server.listen(port, host, () => {
  process.stdout.write(
    `[light-minute] Local realtime ASR adapter ready at http://${host}:${port}${realtimeHealthPath}\n`,
  );
});
