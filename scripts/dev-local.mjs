import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const localBinDir = path.join(projectRoot, '.tmp', 'local-bin');
const ffmpegShimPath = path.join(localBinDir, 'ffmpeg.cmd');
const whisperBaseUrl = 'http://127.0.0.1:8178';
const parakeetBaseUrl = 'http://127.0.0.1:8179';

function log(message) {
  process.stdout.write(`[light-meetily] ${message}\n`);
}

function runCommand(file, args) {
  return spawnSync(file, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function getLatestMtime(targetPath) {
  const stats = statSync(targetPath);

  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  return readdirSync(targetPath).reduce((latest, entry) => {
    const entryPath = path.join(targetPath, entry);
    return Math.max(latest, getLatestMtime(entryPath));
  }, stats.mtimeMs);
}

function ensureLocalParakeetHelper() {
  const helperPath = path.join(resolvedProjectRoot, 'runtime', 'bin', 'light-parakeet-helper.exe');
  const helperSourceRoot = path.join(projectRoot, 'runtime', 'parakeet-helper-src');
  const buildScriptPath = path.join(projectRoot, 'scripts', 'build-local-parakeet-helper.cmd');
  const shouldBuild =
    !existsSync(helperPath) ||
    (existsSync(helperSourceRoot) && getLatestMtime(helperSourceRoot) > getLatestMtime(helperPath));

  if (!shouldBuild && existsSync(helperPath)) {
    return true;
  }

  if (!existsSync(buildScriptPath)) {
    return false;
  }

  log(
    existsSync(helperPath)
      ? 'Rebuilding the local Parakeet helper because the source changed...'
      : 'Building the local Parakeet helper because the upload runtime binary is missing...',
  );
  const buildResult = runCommand('cmd.exe', ['/d', '/s', '/c', `"${buildScriptPath}"`]);

  if (buildResult.status !== 0) {
    log('Failed to build the local Parakeet helper automatically.');
    if (buildResult.stdout?.trim()) {
      log(buildResult.stdout.trim());
    }
    if (buildResult.stderr?.trim()) {
      log(buildResult.stderr.trim());
    }
    return false;
  }

  return existsSync(helperPath);
}

function pathHasNonAsciiCharacters(targetPath) {
  return /[^\u0000-\u007f]/u.test(targetPath);
}

function ensureAsciiProjectRoot() {
  const driveLetter = 'M:';
  const driveRoot = `${driveLetter}\\`;

  if (!pathHasNonAsciiCharacters(projectRoot)) {
    return {
      root: projectRoot,
      cleanup: () => {},
    };
  }

  const substResult = runCommand('cmd.exe', ['/d', '/s', '/c', 'subst']);
  const normalizedProjectRoot = projectRoot.replace(/\//g, '\\').toLowerCase();
  const existingLine = substResult.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(`${driveLetter.toLowerCase()} =>`));

  if (existingLine) {
    if (existingLine.toLowerCase().includes(normalizedProjectRoot)) {
      log(`Reusing ASCII repo alias ${driveLetter} for the light-Meetily workspace.`);
      return {
        root: driveRoot,
        cleanup: () => {},
      };
    }

    log(`${driveLetter} is already mapped elsewhere, so the whisper server may still struggle with Unicode paths.`);
    return {
      root: projectRoot,
      cleanup: () => {},
    };
  }

  const createResult = runCommand('cmd.exe', [
    '/d',
    '/s',
    '/c',
    `subst ${driveLetter} "${projectRoot}"`,
  ]);

  if (createResult.status !== 0) {
    log(`Failed to create ASCII repo alias ${driveLetter}; continuing with the project path.`);
    return {
      root: projectRoot,
      cleanup: () => {},
    };
  }

  log(`Created temporary ASCII repo alias ${driveLetter} for the light-Meetily workspace.`);
  return {
    root: driveRoot,
    cleanup: () => {
      runCommand('cmd.exe', ['/d', '/s', '/c', `subst ${driveLetter} /d`]);
    },
  };
}

const projectRootHandle = ensureAsciiProjectRoot();
const resolvedProjectRoot = projectRootHandle.root;
const whisperPackageDir = path.join(resolvedProjectRoot, 'runtime', 'whisper-server-package');
const whisperExePath = path.join(whisperPackageDir, 'whisper-server.exe');
const whisperModelArg = path.join('models', 'ggml-tiny.en.bin');
const whisperModelPath = path.join(whisperPackageDir, whisperModelArg);
const ffmpegExePath = path.join(resolvedProjectRoot, 'runtime', 'bin', 'ffmpeg.exe');

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

async function startLocalWhisperIfNeeded() {
  if (await isServerReachable(`${whisperBaseUrl}/`)) {
    log('Reusing existing light-Meetily whisper server on 127.0.0.1:8178.');
    return null;
  }

  if (!existsSync(whisperExePath) || !existsSync(whisperModelPath)) {
    log('The light-Meetily whisper runtime is missing; upload analysis will need an API endpoint instead.');
    return null;
  }

  const hasFfmpegShim = ensureLocalFfmpegShim();
  const args = [
    '--model',
    whisperModelArg,
    '--host',
    '127.0.0.1',
    '--port',
    '8178',
    '--print-progress',
  ];

  if (hasFfmpegShim) {
    args.push('--convert');
  }

  log('Starting light-Meetily whisper server for local upload transcription...');
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
    log('Local whisper server is ready at http://127.0.0.1:8178.');
  }

  return whisperProcess;
}

async function startLocalParakeetIfNeeded() {
  if (await isServerReachable(`${parakeetBaseUrl}/health`)) {
    log('Reusing existing light-Meetily Parakeet server on 127.0.0.1:8179.');
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
    log('The local Parakeet upload runtime is missing; audio uploads will fall back to whisper or API mode.');
    return null;
  }

  mkdirSync(tempDir, { recursive: true });

  log('Starting light-Meetily Parakeet upload server for local multilingual transcription...');
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
    log('Local Parakeet upload server is ready at http://127.0.0.1:8179.');
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
