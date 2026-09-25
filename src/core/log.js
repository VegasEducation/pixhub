// Tiny leveled logger. No dependencies, no config file — LOG_LEVEL env only.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function emit(level, scope, args) {
  if (LEVELS[level] < threshold) return;
  const prefix = `${stamp()} ${level.toUpperCase().padEnd(5)} ${scope ? `[${scope}] ` : ''}`;
  const stream = LEVELS[level] >= LEVELS.warn ? console.error : console.log;
  stream(prefix + args.map(fmtArg).join(' '));
}

function fmtArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || a.message;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

/**
 * Create a logger bound to a scope name, e.g. logger('crypto').info('...').
 * Screens get one of these so their output is always attributable.
 */
export function logger(scope = '') {
  return {
    scope,
    debug: (...a) => emit('debug', scope, a),
    info: (...a) => emit('info', scope, a),
    warn: (...a) => emit('warn', scope, a),
    error: (...a) => emit('error', scope, a),
    child: (sub) => logger(scope ? `${scope}:${sub}` : sub),
  };
}

export const log = logger();
