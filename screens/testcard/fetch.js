#!/usr/bin/env node
// Width test card. Not a real screen — a tool for checking the font width
// table against the actual display.
//
// Every line is drawn RIGHT-ALIGNED and flush to the edge, so the right side of
// the panel acts as a ruler:
//
//   line ends exactly at the edge   -> that character's width is correct
//   line stops short                -> pixhub thinks it's wider than it is
//   line runs off / wraps           -> pixhub thinks it's narrower than it is
//
// Single characters are repeated so a 1px error becomes a 6px error and is
// impossible to miss. Anything longer than one character is drawn as-is, which
// is how you check a real value like "$1,908".
//
// Set the characters to test without editing anything:
//   TESTCARD_CHARS="M W , $ % 8"     in .env, space separated
//   TESTCARD_REPEAT=6

const DEFAULT_CHARS = '$ , . % K M W';

// Space separated by default. Use '|' instead when an entry needs to contain a
// space — "8 8 8 8" is how you check the width of the space character itself.
const raw = (process.env.TESTCARD_CHARS || DEFAULT_CHARS).trim();
const chars = raw
  .split(raw.includes('|') ? '|' : /\s+/)
  .map((entry) => entry.trim())
  .filter(Boolean);
// Five copies turns a 1px error into a 5px one. The left-hand label is
// dropped when the line leaves no room for it — 'W' at 11px is one such case.
const repeat = Math.max(1, Number(process.env.TESTCARD_REPEAT) || 5);

// Six rows of font 2 is what fits vertically: 2..47, each 9px tall. A seventh
// at y=56 clips against the bottom of the panel.
const lines = chars.slice(0, 6).map((entry) => ({
  label: entry.length === 1 ? entry : entry.slice(0, 3),
  text: entry.length === 1 ? entry.repeat(repeat) : entry,
}));

console.log(JSON.stringify({ lines }));
