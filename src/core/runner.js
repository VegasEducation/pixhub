// Runs a screen's script and parses what it prints.
//
// The contract is deliberately the smallest thing that could work: write JSON
// to stdout, exit 0. Any language, any tool. A screen can be one line of shell.

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve as resolvePath, extname } from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const MAX_OUTPUT_BYTES = 2_000_000;

// Used when a script isn't marked executable — which is most of the time, since
// git doesn't always preserve the bit and Windows has no concept of it.
const INTERPRETERS = {
  '.js': ['node'],
  '.mjs': ['node'],
  '.py': ['python3'],
  '.sh': ['sh'],
  '.bash': ['bash'],
  '.rb': ['ruby'],
  '.pl': ['perl'],
};

/**
 * Work out the argv for a screen's script.
 *
 * `command` in screen.json wins and is passed through verbatim, for anything
 * unusual. Otherwise `script` is a file in the screen's folder: run directly if
 * executable, otherwise handed to the interpreter its extension implies.
 */
export function resolveCommand(screen) {
  const { config, dir } = screen;

  if (Array.isArray(config.command) && config.command.length > 0) {
    return { argv: config.command, description: config.command.join(' ') };
  }

  if (!config.script) return null;

  const scriptPath = resolvePath(dir, config.script);
  if (!existsSync(scriptPath)) {
    throw new Error(`script "${config.script}" not found in ${dir}`);
  }

  if (isExecutable(scriptPath)) {
    return { argv: [scriptPath], description: config.script };
  }

  const interpreter = INTERPRETERS[extname(scriptPath).toLowerCase()];
  if (!interpreter) {
    throw new Error(
      `"${config.script}" is not executable and has no known interpreter. ` +
        `Either chmod +x it, use a known extension (${Object.keys(INTERPRETERS).join(', ')}), ` +
        `or set "command" in screen.json.`
    );
  }

  return { argv: [...interpreter, scriptPath], description: `${interpreter[0]} ${config.script}` };
}

function isExecutable(path) {
  try {
    return (statSync(path).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Run a screen's script and return the parsed JSON it printed.
 *
 * Retries are here rather than inside every script: a flaky API shouldn't
 * require each screen author to implement backoff.
 */
export async function runScript(screen, { log, timeoutMs, retries = DEFAULT_RETRIES } = {}) {
  const command = resolveCommand(screen);
  if (!command) throw new Error('screen has no "script" or "command"');

  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = Math.min(1000 * 2 ** (attempt - 1), 8000);
      log?.warn(`retrying in ${wait / 1000}s (attempt ${attempt + 1}/${retries + 1})`);
      await sleep(wait);
    }

    try {
      const stdout = await execute(command.argv, screen, timeout, log);
      return parseJson(stdout, command.description);
    } catch (err) {
      lastError = err;
      // A script that doesn't exist or prints garbage won't fix itself.
      if (err.fatal) throw err;
    }
  }

  throw lastError;
}

function execute(argv, screen, timeout, log) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: screen.dir,
      env: {
        ...process.env,
        // Scripts get their own identity, so one script can serve several
        // screens if you point them at it.
        PIXHUB_SCREEN: screen.name,
        PIXHUB_SCREEN_DIR: screen.dir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT_BYTES) {
        killed = true;
        child.kill('SIGKILL');
      }
    });

    // stderr is for the human, not the parser — scripts can log freely there.
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const failure = new Error(
        err.code === 'ENOENT'
          ? `cannot run "${argv[0]}" — is it installed in the container?`
          : `failed to start script: ${err.message}`
      );
      failure.fatal = err.code === 'ENOENT';
      reject(failure);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      for (const line of stderr.split('\n')) {
        if (line.trim()) log?.debug(`script: ${line.trim()}`);
      }

      if (killed) {
        return reject(new Error(`script exceeded ${timeout / 1000}s and was killed`));
      }
      if (code !== 0) {
        const detail = summariseStderr(stderr);
        return reject(new Error(`script exited ${code}${detail ? `: ${detail}` : ''}`));
      }
      resolvePromise(stdout);
    });
  });
}

/**
 * Pull the useful line out of a script's stderr.
 *
 * Interpreters print the message first and then a stack; taking the tail gives
 * you frame addresses instead of the reason. Prefer the first line that isn't a
 * stack frame, and fall back to whatever there is.
 */
function summariseStderr(stderr) {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    // Node: "    at foo (file:...)"  Python: "  File ...", "Traceback ..."
    .filter((line) => !/^at\s/.test(line) && !/^File "/.test(line));

  const meaningful = lines.find((line) => !/^Traceback/.test(line));
  return (meaningful || lines[0] || '').slice(0, 300);
}

function parseJson(stdout, description) {
  const text = stdout.trim();

  if (!text) {
    const err = new Error(`${description} printed nothing — it must write JSON to stdout`);
    err.fatal = true;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error(
      `${description} printed something that isn't JSON: ${text.slice(0, 160)}` +
        (text.length > 160 ? '…' : '')
    );
    err.fatal = true;
    throw err;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
