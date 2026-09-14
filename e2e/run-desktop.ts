/**
 * Build the desktop SPA, launch Deno Desktop (CEF + CDP), run Playwright
 * against the webview, then tear down.
 *
 * Playwright is invoked with Node: Bun cannot complete the CEF CDP handshake.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;
const INSPECT_PORT = 9229;
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;
const PLAYWRIGHT_CLI = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: CDP_HOST, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type CdpTarget = { type?: string; url?: string; title?: string };

async function waitForDesktopPage(timeoutMs: number): Promise<{ origin: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = (await fetchJson(`${CDP_URL}/json/list`)) as CdpTarget[] | null;
    const page = list?.find((t) => t.type === 'page' && t.url?.startsWith('http'));
    if (page?.url) {
      const origin = new URL(page.url).origin;
      return { origin };
    }
    await wait(300);
  }
  throw new Error(`Deno Desktop CEF did not expose a page at ${CDP_URL} within ${timeoutMs}ms`);
}

function run(command: string, args: string[], opts?: { env?: NodeJS.ProcessEnv }): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: opts?.env ?? process.env,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} killed by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

function spawnDesktop(): ChildProcess {
  return spawn(
    'deno',
    [
      'desktop',
      '--no-config',
      '--backend',
      'cef',
      `--inspect=127.0.0.1:${INSPECT_PORT}`,
      `--inspect-renderer=${CDP_HOST}:${CDP_PORT}`,
      '--allow-read',
      '--allow-net',
      '--allow-env',
      '--include',
      'dist',
      '--no-prompt',
      'desktop/main.ts',
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

async function pidsOnPort(port: number): Promise<number[]> {
  const proc = spawn('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const chunks: Buffer[] = [];
  proc.stdout?.on('data', (c: Buffer) => chunks.push(c));
  await new Promise<void>((resolve) => proc.on('close', () => resolve()));
  return Buffer.concat(chunks)
    .toString()
    .split(/\s+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function killPid(pid: number) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function killProcessTree(child: ChildProcess) {
  const extra = [...(await pidsOnPort(CDP_PORT)), ...(await pidsOnPort(INSPECT_PORT))];
  if (child.pid) extra.push(child.pid);
  for (const pid of extra) killPid(pid);
  await wait(400);
  for (const pid of extra) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

if (await portOpen(CDP_PORT)) {
  throw new Error(`Port ${CDP_PORT} is already in use; stop the other Deno Desktop inspect session`);
}

console.log('Building desktop SPA…');
const buildCode = await run('bun', ['x', 'vite', 'build', '--mode', 'desktop']);
if (buildCode !== 0) process.exit(buildCode);

console.log('Launching Deno Desktop (CEF)…');
const desktop = spawnDesktop();
let shuttingDown = false;
let desktopLog = '';
desktop.stdout?.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  desktopLog += text;
  process.stdout.write(text);
});
desktop.stderr?.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  desktopLog += text;
  process.stderr.write(text);
});
desktop.on('exit', (code, signal) => {
  if (!shuttingDown && (code || signal)) {
    console.error(`Deno Desktop exited early (code=${code} signal=${signal})`);
  }
});

let exitCode = 1;
try {
  const { origin } = await waitForDesktopPage(120_000);
  console.log(`CEF page ready at ${origin} (CDP ${CDP_URL})`);

  exitCode = await run(process.execPath.includes('bun') ? 'node' : process.execPath, [
    PLAYWRIGHT_CLI,
    'test',
    '-c',
    'playwright.desktop.config.ts',
    ...process.argv.slice(2),
  ], {
    env: {
      ...process.env,
      E2E_CDP_URL: CDP_URL,
      E2E_ORIGIN: origin,
    },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (desktopLog.trim()) console.error('Deno Desktop log:\n', desktopLog.slice(-4000));
  exitCode = 1;
} finally {
  shuttingDown = true;
  await killProcessTree(desktop);
}

process.exit(exitCode);
