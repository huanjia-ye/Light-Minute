import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  buildPreferredWhisperModelCandidates,
  getWhisperRuntimeProfile,
  resolvePreferredWhisperThreadCount,
} from './local-whisper-runtime-config.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const localBinDir = path.join(projectRoot, '.tmp', 'local-bin');
const ffmpegShimPath = path.join(localBinDir, 'ffmpeg.cmd');
const whisperBaseUrl = 'http://127.0.0.1:8178';
const parakeetBaseUrl = 'http://127.0.0.1:8179';
const realtimeBaseUrl = 'http://127.0.0.1:8180';

function log(message) {
  process.stdout.write(`[light-minute] ${message}\n`);
}

function runCommand(file, args) {
  return spawnSync(file, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function ensureLocalParakeetHelper() {
  const helperPath = path.join(resolvedProjectRoot, 'runtime', 'bin', 'light-parakeet-helper.exe');
  return existsSync(helperPath);
}

function pathHasNonAsciiCharacters(targetPath) {
  return /[^\u0000-\u007f]/u.test(targetPath);
}

function ensureAsciiProjectRoot() {
  if (!pathHasNonAsciiCharacters(projectRoot)) {
    return {
      root: projectRoot,
      cleanup: () => {},
    };
  }

  const publicRoot = process.env.PUBLIC || 'C:\\Users\\Public';
  const aliasRoot = path.join(publicRoot, 'light-minute-workspaces');
  const aliasName = `repo-${createHash('sha1').update(projectRoot).digest('hex').slice(0, 8)}`;
  const aliasPath = path.join(aliasRoot, aliasName);
  const projectRealPath = realpathSync(projectRoot);

  try {
    mkdirSync(aliasRoot, { recursive: true });

    if (existsSync(aliasPath)) {
      try {
        if (realpathSync(aliasPath) === projectRealPath) {
          log(`Reusing ASCII repo alias ${aliasPath} for the Light-Minute workspace.`);
          return {
            root: aliasPath,
            cleanup: () => {},
          };
        }
      } catch {
        // Recreate an invalid alias below.
      }

      rmSync(aliasPath, { recursive: true, force: true });
    }

    symlinkSync(projectRoot, aliasPath, 'junction');
    log(`Created temporary ASCII repo alias ${aliasPath} for the Light-Minute workspace.`);
    return {
      root: aliasPath,
      cleanup: () => {
        rmSync(aliasPath, { recursive: true, force: true });
      },
    };
  } catch {
    log(`Failed to create ASCII repo alias at ${aliasPath}; continuing with the project path.`);
    return {
      root: projectRoot,
      cleanup: () => {},
    };
  }
}

const projectRootHandle = ensureAsciiProjectRoot();
const resolvedProjectRoot = projectRootHandle.root;
const whisperPackageDir = path.join(resolvedProjectRoot, 'runtime', 'whisper-server-package');
const whisperExePath = path.join(whisperPackageDir, 'whisper-server.exe');
const whisperModelCandidates = buildPreferredWhisperModelCandidates(process.env.LIGHT_WHISPER_MODEL);
const whisperModelArg =
  whisperModelCandidates.find((candidate) => existsSync(path.join(whisperPackageDir, candidate))) ??
  path.join('models', 'ggml-tiny.en.bin');
const whisperModelPath = path.join(whisperPackageDir, whisperModelArg);
const whisperRuntimeProfile = getWhisperRuntimeProfile(whisperModelArg);
const whisperThreadCount = resolvePreferredWhisperThreadCount(
  process.env.LIGHT_WHISPER_THREADS,
  typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length,
);
const realtimeSupportedLanguages = whisperRuntimeProfile.supportedLanguages.join(',');
const ffmpegExePath = path.join(resolvedProjectRoot, 'runtime', 'bin', 'ffmpeg.exe');
const realtimeServerScript = path.join(projectRoot, 'scripts', 'local-realtime-asr-server.mjs');

async function isServerReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForHttpServer(url, timeoutMs = 45000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReachable(url)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function ensureLocalFfmpegShim() {
  if (!existsSync(ffmpegExePath)) {
    return false;
  }

  mkdirSync(localBinDir, { recursive: true });
  writeFileSync(ffmpegShimPath, `@"${ffmpegExePath}" %*\r\n`);
  return true;
}

async function waitForWhisperServer(timeoutMs = 45000) {
  return waitForHttpServer(`${whisperBaseUrl}/`, timeoutMs);
}

async function waitForRealtimeServer(timeoutMs = 45000) {
  return waitForHttpServer(`${realtimeBaseUrl}/__light_realtime/health`, timeoutMs);
}

async function startLocalWhisperIfNeeded() {
  if (await isServerReachable(`${whisperBaseUrl}/`)) {
    log('Reusing existing Light-Minute whisper server on 127.0.0.1:8178.');
    return null;
  }

  if (!existsSync(whisperExePath) || !existsSync(whisperModelPath)) {
    log('The optional Light-Minute whisper runtime is missing; uploads will use API or demo fallback instead.');
    return null;
  }

  const hasFfmpegShim = ensureLocalFfmpegShim();
  const args = [
    '--model',
    whisperModelArg,
    '--threads',
    String(whisperThreadCount),
    '--host',
    '127.0.0.1',
    '--port',
    '8178',
    '--print-progress',
  ];

  if (hasFfmpegShim) {
    args.push('--convert');
  }

  if (whisperRuntimeProfile.isEnglishOnly) {
    log(
      `Using english-only whisper model ${whisperRuntimeProfile.modelName}; realtime support is limited to ${whisperRuntimeProfile.supportedLanguages.join(', ')}.`,
    );
  }

  log(
    `Starting Light-Minute whisper server for local upload transcription with ${whisperModelArg} (${whisperThreadCount} threads)...`,
  );
  const whisperProcess = spawn(whisperExePath, args, {
    cwd: whisperPackageDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${localBinDir};${path.dirname(ffmpegExePath)};${process.env.PATH ?? ''}`,
    },
  });

  const ready = await waitForWhisperServer();
  if (!ready) {
    log('Local whisper server did not become ready in time; uploads may still fall back to API mode.');
  } else {
    log('Light-Minute whisper server is ready at http://127.0.0.1:8178.');
  }

  return whisperProcess;
}

async function startLocalRealtimeIfNeeded() {
  if (await isServerReachable(`${realtimeBaseUrl}/__light_realtime/health`)) {
    log('Reusing existing Light-Minute realtime ASR adapter on 127.0.0.1:8180.');
    return null;
  }

  if (!existsSync(realtimeServerScript)) {
    log('The realtime ASR adapter script is missing; realtime voice input will not be available.');
    return null;
  }

  log('Starting Light-Minute realtime ASR adapter...');
  const realtimeProcess = spawn(process.execPath, [realtimeServerScript], {
    cwd: projectRoot,
    stdio: 'inherit',
      env: {
        ...process.env,
        LIGHT_REALTIME_PORT: '8180',
        LIGHT_REALTIME_WHISPER_BASE_URL: whisperBaseUrl,
        LIGHT_REALTIME_MODEL: path.basename(whisperModelArg),
        LIGHT_REALTIME_SUPPORTED_LANGUAGES: realtimeSupportedLanguages,
      },
  });

  const ready = await waitForRealtimeServer();
  if (!ready) {
    log('Local realtime ASR adapter did not become ready in time; realtime voice input may not be available.');
  } else {
    log('Light-Minute realtime ASR adapter is ready at http://127.0.0.1:8180.');
  }

  return realtimeProcess;
}

async function startLocalParakeetIfNeeded() {
  if (await isServerReachable(`${parakeetBaseUrl}/health`)) {
    log('Reusing existing Light-Minute Parakeet server on 127.0.0.1:8179.');
    return null;
  }

  const parakeetServerScript = path.join(projectRoot, 'scripts', 'local-parakeet-server.mjs');
  const parakeetHelperReady = ensureLocalParakeetHelper();
  const parakeetHelperPath = path.join(
    resolvedProjectRoot,
    'runtime',
    'bin',
    'light-parakeet-helper.exe',
  );
  const parakeetModelPath = path.join(
    resolvedProjectRoot,
    'runtime',
    'parakeet',
    'parakeet-tdt-0.6b-v3-int8',
  );
  const tempDir = path.join(resolvedProjectRoot, '.tmp', 'parakeet-server-temp');

  if (
    !existsSync(parakeetServerScript) ||
    !parakeetHelperReady ||
    !existsSync(parakeetHelperPath) ||
    !existsSync(parakeetModelPath)
  ) {
    log('The optional Light-Minute Parakeet runtime is missing; audio uploads will fall back to whisper, API, or demo mode.');
    return null;
  }

  mkdirSync(tempDir, { recursive: true });

  log('Starting Light-Minute Parakeet upload server for local multilingual transcription...');
  const parakeetProcess = spawn(
    process.execPath,
    [parakeetServerScript],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        LIGHT_PROJECT_ROOT: resolvedProjectRoot,
        LIGHT_PARAKEET_PORT: '8179',
        LIGHT_PARAKEET_TEMP_DIR: tempDir,
        TEMP: tempDir,
        TMP: tempDir,
      },
    },
  );

  const ready = await waitForHttpServer(`${parakeetBaseUrl}/health`);
  if (!ready) {
    log('Local Parakeet server did not become ready in time; uploads may still fall back to whisper or API mode.');
  } else {
    log('Light-Minute Parakeet upload server is ready at http://127.0.0.1:8179.');
  }

  return parakeetProcess;
}

function buildViteArgs() {
  const forwardedArgs = process.argv.slice(2);
  const hasHostFlag = forwardedArgs.some((arg) => arg === '--host' || arg.startsWith('--host='));

  if (!hasHostFlag) {
    forwardedArgs.push('--host', '127.0.0.1');
  }

  return forwardedArgs;
}

function terminateChild(child) {
  if (!child || child.killed) {
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // Ignore shutdown errors.
  }
}

function quoteWindowsArg(arg) {
  if (/[\s"]/u.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }

  return arg;
}

const whisperProcess = await startLocalWhisperIfNeeded();
const realtimeProcess = await startLocalRealtimeIfNeeded();
const parakeetProcess = await startLocalParakeetIfNeeded();
const viteCommand =
  process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'vite.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'vite');
const viteArgs = buildViteArgs();
const viteProcess =
  process.platform === 'win32'
    ? spawn(
        'cmd.exe',
        ['/d', '/s', '/c', [viteCommand, ...viteArgs].map(quoteWindowsArg).join(' ')],
        {
          cwd: projectRoot,
          stdio: 'inherit',
          env: process.env,
        },
      )
    : spawn(viteCommand, viteArgs, {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env,
      });

const shutdown = () => {
  terminateChild(viteProcess);
  terminateChild(whisperProcess);
  terminateChild(realtimeProcess);
  terminateChild(parakeetProcess);
  projectRootHandle.cleanup();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

viteProcess.on('exit', (code) => {
  shutdown();
  process.exit(code ?? 0);
});
