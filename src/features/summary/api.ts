import { resolveChatCompletionsUrl, getProviderLabel } from '../../lib/openaiCompatible';
import { sleep } from '../../lib/storage';
import type { MeetingRecord, MeetingSummary, SummaryTemplateId } from '../../types/meeting';
import type { AppSettings } from '../../types/settings';
import { normalizeSettings } from '../settings/store';

interface GenerateMeetingSummaryOptions {
  onProgress?: (markdown: string) => void;
  signal?: AbortSignal;
}

function normalizeLines(text: string) {
  return text
    .split(/[.!?]\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectKeyPoints(lines: string[]) {
  return lines.slice(0, 4).map((line) => `- ${line}.`);
}

function collectDecisionLines(lines: string[]) {
  const matches = lines.filter((line) =>
    /(agreed|decided|focus on|ship|keep|postpone)/i.test(line),
  );

  return matches.length ? matches : ['The team aligned on the lightweight MVP scope and prioritized a reliable recording flow.'];
}

function collectActionItems(lines: string[]) {
  const matches = lines.filter((line) => /(should|will|next week|action item|need to)/i.test(line));
  return matches.length ? matches : ['Finish the MVP pages and wire the backend adapters after the frontend flow is stable.'];
}

function buildSection(title: string, bullets: string[]) {
  return [`## ${title}`, ...bullets].join('\n');
}

function buildSummaryMarkdown(
  meeting: MeetingRecord,
  templateId: SummaryTemplateId,
  providerLabel: string,
  model: string,
  customPrompt: string,
) {
  const fullText = meeting.segments.map((segment) => segment.text).join(' ');
  const lines = normalizeLines(fullText);
  const overview = lines.slice(0, 2).join('. ') || 'No transcript content was available.';
  const keyPoints = collectKeyPoints(lines);
  const decisions = collectDecisionLines(lines).map((line) => `- ${line}.`);
  const actionItems = collectActionItems(lines).map((line) => `- ${line}.`);
  const followUps = [
    `- Summary generated with ${providerLabel} / ${model}.`,
    customPrompt ? `- Extra context applied: ${customPrompt}.` : '- No extra context prompt was supplied.',
    `- Transcript segments processed: ${meeting.segments.length}.`,
  ];

  const templateLead =
    templateId === 'project-sync'
      ? 'Project sync summary with clear delivery notes and next steps.'
      : 'Standard meeting summary with key points, decisions and action items.';

  return [
    `# ${meeting.title}`,
    '',
    `> ${templateLead}`,
    '',
    '## Overview',
    `${overview}.`,
    '',
    buildSection('Key Points', keyPoints),
    '',
    buildSection('Decisions', decisions),
    '',
    buildSection('Action Items', actionItems),
    '',
    buildSection('Follow-up Notes', followUps),
  ].join('\n');
}

function createAbortError() {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function sleepWithSignal(ms: number, signal?: AbortSignal) {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', handleAbort);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function extractStreamDelta(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const maybeChoices = (payload as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> }).choices;
  const firstChoice = maybeChoices?.[0];

  if (typeof firstChoice?.delta?.content === 'string') {
    return firstChoice.delta.content;
  }

  if (typeof firstChoice?.message?.content === 'string') {
    return firstChoice.message.content;
  }

  return '';
}

function consumeSseEvents(
  rawEvent: string,
  markdown: string,
  onProgress?: (nextMarkdown: string) => void,
) {
  let nextMarkdown = markdown;
  let isDone = false;

  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const data = line.slice(5).trim();
    if (!data) {
      continue;
    }

    if (data === '[DONE]') {
      isDone = true;
      continue;
    }

    try {
      const payload = JSON.parse(data);
      const delta = extractStreamDelta(payload);

      if (delta) {
        nextMarkdown += delta;
        onProgress?.(nextMarkdown);
      }
    } catch {
      // Ignore malformed chunks and keep consuming the stream.
    }
  }

  return { nextMarkdown, isDone };
}

async function readSummaryStream(
  response: Response,
  onProgress?: (markdown: string) => void,
  signal?: AbortSignal,
) {
  if (!response.body) {
    throw new Error('Summary generation stream is unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let markdown = '';

  while (true) {
    throwIfAborted(signal);

    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const result = consumeSseEvents(rawEvent, markdown, onProgress);
      markdown = result.nextMarkdown;

      if (result.isDone) {
        return markdown.trim();
      }

      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const result = consumeSseEvents(buffer, markdown, onProgress);
    markdown = result.nextMarkdown;
  }

  return markdown.trim();
}

async function streamDemoSummary(
  markdown: string,
  onProgress?: (nextMarkdown: string) => void,
  signal?: AbortSignal,
) {
  if (!onProgress) {
    await sleep(1800);
    return markdown;
  }

  const chunkSize = 48;
  let nextMarkdown = '';

  for (let index = 0; index < markdown.length; index += chunkSize) {
    await sleepWithSignal(90, signal);
    nextMarkdown += markdown.slice(index, index + chunkSize);
    onProgress(nextMarkdown);
  }

  return nextMarkdown;
}

export async function generateMeetingSummary(
  meeting: MeetingRecord,
  settings: AppSettings,
  customPrompt: string,
  options: GenerateMeetingSummaryOptions = {},
): Promise<MeetingSummary> {
  const resolvedSettings = normalizeSettings(settings);
  const apiKey = resolvedSettings.apiKey.trim() || resolvedSettings.transcriptionApiKey.trim();
  const endpoint =
    resolvedSettings.endpoint.trim() || resolvedSettings.transcriptionEndpoint.trim();
  const wantsStreaming = Boolean(options.onProgress);

  if (apiKey) {
    const url = resolveChatCompletionsUrl(endpoint);
    const transcript = meeting.segments
      .map((segment) => `[${segment.startTime}s-${segment.endTime}s] ${segment.text}`)
      .join('\n');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedSettings.model,
        temperature: 0.2,
        stream: wantsStreaming,
        messages: [
          {
            role: 'system',
            content:
              'You summarize meeting transcripts into clean markdown with sections for Overview, Key Points, Decisions, Action Items, and Follow-up Notes.',
          },
          {
            role: 'user',
            content: [
              `Meeting title: ${meeting.title}`,
              `Template: ${resolvedSettings.templateId}`,
              customPrompt ? `Extra context: ${customPrompt}` : 'Extra context: none',
              '',
              'Transcript:',
              transcript,
            ].join('\n'),
          },
        ],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Summary generation failed (${response.status}). ${body}`.trim());
    }

    const markdown = wantsStreaming
      ? await readSummaryStream(response, options.onProgress, options.signal)
      : ((await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        }).choices?.[0]?.message?.content?.trim();

    if (!markdown) {
      throw new Error('Summary generation returned an empty response.');
    }

    const now = new Date().toISOString();

    return {
      markdown,
      provider: resolvedSettings.provider,
      model: resolvedSettings.model,
      templateId: resolvedSettings.templateId,
      prompt: customPrompt,
      generatedAt: now,
      updatedAt: now,
    };
  }

  const providerLabel = getProviderLabel(resolvedSettings.provider);
  const markdown = buildSummaryMarkdown(
    meeting,
    resolvedSettings.templateId,
    providerLabel,
    resolvedSettings.model,
    customPrompt,
  );
  if (!wantsStreaming) {
    await sleep(1800);
  }
  const streamedMarkdown = await streamDemoSummary(markdown, options.onProgress, options.signal);
  const now = new Date().toISOString();

  return {
    markdown: streamedMarkdown,
    provider: resolvedSettings.provider,
    model: resolvedSettings.model,
    templateId: resolvedSettings.templateId,
    prompt: customPrompt,
    generatedAt: now,
    updatedAt: now,
  };
}
