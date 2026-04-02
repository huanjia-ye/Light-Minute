import { createServer } from 'node:http';
import { mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.LIGHT_PROJECT_ROOT || path.resolve(scriptDir, '..');
const runtimeBinDir = path.join(projectRoot, 'runtime', 'bin');
const helperExePath = path.join(runtimeBinDir, 'light-parakeet-helper.exe');
const ffmpegExePath = path.join(runtimeBinDir, 'ffmpeg.exe');
const modelDir = path.join(projectRoot, 'runtime', 'parakeet', 'parakeet-tdt-0.6b-v3-int8');
const tempDir = process.env.LIGHT_PARAKEET_TEMP_DIR || path.join(projectRoot, '.tmp', 'parakeet-server-temp');
const port = Number(process.env.LIGHT_PARAKEET_PORT || '8179');

mkdirSync(tempDir, { recursive: true });

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-File-Name',
  });
  response.end(JSON.stringify(payload));
}

function runHelper(inputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      helperExePath,
      [
        '--model-dir',
        modelDir,
        '--ffmpeg',
        ffmpegExePath,
        '--input',
        inputPath,
      ],
      {
        cwd: runtimeBinDir,
        env: {
          ...process.env,
          PATH: `${runtimeBinDir};${process.env.PATH ?? ''}`,
          TEMP: tempDir,
          TMP: tempDir,
        },
        windowsHide: true,
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `helper exited with code ${code}`));
    });
  });
}

function getUploadExtension(request) {
  const headerValue = request.headers['x-file-name'];
  const rawName = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (rawName) {
    const decoded = decodeURIComponent(rawName);
    const extension = path.extname(decoded);
    if (extension) {
      return extension;
    }
  }

  return '.wav';
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL' });
    return;
  }

  const requestUrl = new URL(request.url, `http://127.0.0.1:${port}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-File-Name',
      'Cache-Control': 'no-store',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/health')) {
    sendJson(response, 200, {
      status: 'ok',
      helperExePath,
      modelDir,
    });
    return;
  }

  if (request.method !== 'POST' || requestUrl.pathname !== '/transcribe') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);
  if (!body.length) {
    sendJson(response, 400, { error: 'No audio payload received' });
    return;
  }

  const uploadPath = path.join(tempDir, `${randomUUID()}${getUploadExtension(request)}`);

  try {
    await fs.writeFile(uploadPath, body);
    const stdout = await runHelper(uploadPath);
    sendJson(response, 200, JSON.parse(stdout));
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Local Parakeet transcription failed',
    });
  } finally {
    await fs.unlink(uploadPath).catch(() => {});
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`[light-minute] Local Parakeet upload server ready at http://127.0.0.1:${port}\n`);
});
