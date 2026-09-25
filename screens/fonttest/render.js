// Font test card. Like screens/testcard, this is a tool rather than a display.
//
// The device's font ids aren't documented anywhere reliable, and this firmware
// doesn't answer Device/GetTimeDialFontList, so the only way to find out what
// your Pixoo actually supports is to draw the same text at each id and look.
// Ids the firmware doesn't recognise tend to fall back to a default rather than
// failing, which is why two rows looking identical is a meaningful result.
//
// Configure without editing anything:
//   FONTTEST_FONTS="0 1 2 3"    ids to draw, one per row
//   FONTTEST_TEXT="Ag8"         cap height, descender and a digit in three chars
//   FONTTEST_STEP=16            row spacing; raise it if tall fonts collide
//
// This screen uses render.js rather than rows/items in screen.json because each
// row needs a different font, which the config format deliberately doesn't
// express — it's exactly the case the escape hatch exists for.

const MAX_ROWS = 4;

export function render({ config }) {
  const fonts = (process.env.FONTTEST_FONTS || '0 1 2 3')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);

  const sample = process.env.FONTTEST_TEXT || 'Ag8';
  const step = Number(process.env.FONTTEST_STEP) || 16;

  const items = [];

  fonts.slice(0, MAX_ROWS).forEach((font, index) => {
    const y = 2 + index * step;

    // The row label is always font 2 — the one that's been measured — so it
    // stays readable even when the font being tested renders as nothing.
    items.push({ text: `f${font}`, x: 1, y, font: 2, color: 'dim' });
    items.push({ text: sample, x: 18, y, font, color: 'accent' });
  });

  return { background: config.background, items };
}
