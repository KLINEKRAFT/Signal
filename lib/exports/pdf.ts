import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Block, RecapDocument } from './document';

/**
 * PDF rendering with pdf-lib.
 *
 * Chosen over a headless browser or LaTeX because it is pure JS with no
 * binaries, which is what makes it viable inside a serverless function.
 *
 * The type is the app's own — Space Grotesk and IBM Plex Mono, embedded and
 * subsetted, rather than the Helvetica the standard-fourteen would have given
 * us. A recap is forwarded to clients; it should not arrive looking like a
 * different product from the one that made it. Subsetting keeps the four faces
 * to a few kilobytes in the finished file.
 */

/** US Letter. Recaps are printed and filed alongside US paperwork. */
const PAGE = { width: 612, height: 792 };

const MARGIN_X = 56;
const CONTENT_WIDTH = PAGE.width - MARGIN_X * 2;

/** The black band at the foot of every page, carrying the maker's mark. */
const FOOTER_H = 46;
/** Lowest baseline body text may occupy before the page turns. */
const CONTENT_FLOOR = FOOTER_H + 30;
/** Where body text starts on a continuation page, below the running header. */
const CONTENT_CEILING = PAGE.height - 66;

const INK = rgb(0.04, 0.04, 0.04);
const GRAY = rgb(0.42, 0.41, 0.39);
const GRAY_LIGHT = rgb(0.62, 0.61, 0.58);
const LINE = rgb(0.85, 0.84, 0.82);
const ACCENT = rgb(0.84, 0.13, 0.16);
const PAPER = rgb(1, 1, 1);

type Fonts = {
  regular: PDFFont;
  medium: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
};

const FONT_DIR = join(process.cwd(), 'lib/exports/fonts');

/**
 * Strip only what cannot be drawn.
 *
 * The embedded faces cover Latin plus the typographic characters this product
 * actually emits — curly quotes, dashes, the ellipsis, the middle dot — so
 * unlike the standard-fourteen encoding there is nothing to approximate. What
 * remains are control characters, which have no glyph anywhere and would
 * otherwise throw mid-render.
 */
function sanitize(text: string): string {
  // Control characters only. Nothing here has a glyph in any face, and an
  // unescaped one would otherwise throw mid-render.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
}

/** Greedy wrap against real glyph widths — pdf-lib will not wrap for us. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);

    // A single word too long for the measure (a URL, usually) is hard-split
    // rather than allowed to run off the page.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

/**
 * Draw text with letter spacing, which pdf-lib has no option for.
 *
 * The technical labels are the interface's voice — wide-tracked mono caps — and
 * without tracking they read as ordinary small type. One glyph at a time is
 * affordable because these strings are short by definition.
 */
function drawTracked(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; tracking?: number },
): number {
  const tracking = opts.tracking ?? opts.size * 0.18;

  // Tc is PDF's own character-spacing parameter, so this stays one drawText.
  // Drawing glyph by glyph also works, but pdf-lib appends a random suffix to
  // the font resource key on every drawText call — a 27-character label would
  // add 27 entries to the page's resource dictionary for one line of type.
  // Wrapped in a graphics-state push so the spacing cannot leak into later text.
  page.pushOperators(pushGraphicsState(), setCharacterSpacing(tracking));
  page.drawText(text, {
    x: opts.x,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.color,
  });
  page.pushOperators(popGraphicsState());

  return trackedWidth(text, opts.font, opts.size, tracking);
}

function trackedWidth(text: string, font: PDFFont, size: number, tracking = size * 0.18): number {
  let w = 0;
  for (const char of text) w += font.widthOfTextAtSize(char, size) + tracking;
  return Math.max(0, w - tracking);
}

async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  const read = (name: string) => readFileSync(join(FONT_DIR, name));
  const embed = (name: string) => pdf.embedFont(read(name), { subset: true });

  return {
    regular: await embed('SpaceGrotesk-Regular.ttf'),
    medium: await embed('SpaceGrotesk-Medium.ttf'),
    bold: await embed('SpaceGrotesk-Bold.ttf'),
    mono: await embed('IBMPlexMono-Regular.ttf'),
  };
}

/**
 * The maker's mark, if it is on disk.
 *
 * White artwork on transparency, used exactly as supplied — which is why the
 * footer is a black band rather than the logo being recoloured to suit a white
 * page. A missing file is not worth failing an export over; the footer falls
 * back to the wordmark set in type.
 */
async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    return await pdf.embedPng(readFileSync(join(process.cwd(), 'public/klinekraft-logo.png')));
  } catch {
    return null;
  }
}

export async function toPdf(doc: RecapDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(doc.title);
  pdf.setProducer('SIGNAL');
  pdf.setCreator('SIGNAL — KLINEKRAFT');

  const fonts = await loadFonts(pdf);
  const logo = await loadLogo(pdf);

  const pages: PDFPage[] = [];
  let page: PDFPage;
  let y = 0;

  /** Thin running header. Page 1 has the masthead instead and skips this. */
  function drawRunningHeader(target: PDFPage) {
    const title = sanitize(doc.title);
    const clipped =
      fonts.mono.widthOfTextAtSize(title, 7) > CONTENT_WIDTH - 120
        ? `${title.slice(0, 58)}…`
        : title;

    drawTracked(target, clipped.toUpperCase(), {
      x: MARGIN_X,
      y: PAGE.height - 44,
      size: 7,
      font: fonts.mono,
      color: GRAY_LIGHT,
    });

    const right = 'SIGNAL';
    drawTracked(target, right, {
      x: PAGE.width - MARGIN_X - trackedWidth(right, fonts.mono, 7),
      y: PAGE.height - 44,
      size: 7,
      font: fonts.mono,
      color: GRAY_LIGHT,
    });

    target.drawLine({
      start: { x: MARGIN_X, y: PAGE.height - 54 },
      end: { x: PAGE.width - MARGIN_X, y: PAGE.height - 54 },
      thickness: 0.5,
      color: LINE,
    });
  }

  function newPage(withHeader: boolean): PDFPage {
    const created = pdf.addPage([PAGE.width, PAGE.height]);
    pages.push(created);
    if (withHeader) drawRunningHeader(created);
    return created;
  }

  const need = (space: number) => {
    if (y - space >= CONTENT_FLOOR) return;
    page = newPage(true);
    y = CONTENT_CEILING;
  };

  const write = (
    text: string,
    opts: {
      font: PDFFont;
      size: number;
      color?: ReturnType<typeof rgb>;
      leading?: number;
      indent?: number;
    },
  ) => {
    const indent = opts.indent ?? 0;
    const leading = opts.leading ?? opts.size * 1.5;
    for (const line of wrap(sanitize(text), opts.font, opts.size, CONTENT_WIDTH - indent)) {
      need(leading);
      page.drawText(line, {
        x: MARGIN_X + indent,
        y: y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color ?? INK,
      });
      y -= leading;
    }
  };

  /** The app's signature texture, as a section separator. */
  const dotRule = (atY: number, color = LINE) => {
    for (let x = MARGIN_X; x <= PAGE.width - MARGIN_X; x += 5) {
      page.drawCircle({ x, y: atY, size: 0.6, color });
    }
  };

  // ── Masthead ──────────────────────────────────────────────────────────────
  // A black plate rather than a separate cover page: a three-page recap does
  // not earn a title sheet, but it does earn a front that looks composed.
  page = newPage(false);

  // Plate height is derived from the layout inside it, not guessed: eyebrow at
  // top-56, title from top-100 at 33pt per line, accent rule and subtitle
  // below, then 26pt of air. Get this wrong by a few points and the subtitle
  // lands past the bottom edge — white type on white paper, invisible.
  const TITLE_TOP = 100;
  const TITLE_LEADING = 33;
  const SUBTITLE_DROP = 36;
  const PLATE_TAIL = 26;

  // Long titles are clipped rather than allowed to grow the plate without
  // limit; four lines at 27pt is already a third of the page.
  const allTitleLines = wrap(sanitize(doc.title), fonts.bold, 27, CONTENT_WIDTH - 20);
  const titleLines = allTitleLines.slice(0, 4);
  if (allTitleLines.length > titleLines.length) {
    titleLines[titleLines.length - 1] = `${titleLines[titleLines.length - 1].replace(/[\s.,;:—-]+$/, '')}…`;
  }

  const plateHeight =
    TITLE_TOP + titleLines.length * TITLE_LEADING + SUBTITLE_DROP + PLATE_TAIL;

  page.drawRectangle({
    x: 0,
    y: PAGE.height - plateHeight,
    width: PAGE.width,
    height: plateHeight,
    color: INK,
  });

  drawTracked(page, 'SIGNAL // MEDIA INTELLIGENCE', {
    x: MARGIN_X,
    y: PAGE.height - 56,
    size: 7.5,
    font: fonts.mono,
    color: GRAY_LIGHT,
  });

  let plateY = PAGE.height - TITLE_TOP;
  for (const line of titleLines) {
    page.drawText(line, {
      x: MARGIN_X,
      y: plateY - 27,
      size: 27,
      font: fonts.bold,
      color: PAPER,
    });
    plateY -= TITLE_LEADING;
  }

  page.drawLine({
    start: { x: MARGIN_X, y: plateY - 14 },
    end: { x: MARGIN_X + 46, y: plateY - 14 },
    thickness: 2,
    color: ACCENT,
  });

  drawTracked(page, sanitize(doc.subtitle).toUpperCase(), {
    x: MARGIN_X,
    y: plateY - SUBTITLE_DROP,
    size: 8,
    font: fonts.mono,
    color: PAPER,
  });

  y = PAGE.height - plateHeight - 40;

  // ── Body ──────────────────────────────────────────────────────────────────
  // Metadata is a two-column grid rather than a stack of labelled lines, so the
  // front of the document reads as a specification sheet.
  const metaBlocks = doc.blocks.filter((b): b is Extract<Block, { type: 'meta' }> => b.type === 'meta');
  const rest = doc.blocks.filter((b) => b.type !== 'meta');

  if (metaBlocks.length) {
    const colWidth = CONTENT_WIDTH / 2;
    metaBlocks.forEach((block, i) => {
      const col = i % 2;
      const x = MARGIN_X + col * colWidth;
      if (col === 0) need(30);

      drawTracked(page, sanitize(block.label).toUpperCase(), {
        x,
        y: y - 8,
        size: 6.5,
        font: fonts.mono,
        color: GRAY_LIGHT,
      });

      const value = wrap(sanitize(block.value), fonts.regular, 9, colWidth - 16)[0] ?? '';
      page.drawText(value, { x, y: y - 21, size: 9, font: fonts.regular, color: INK });

      if (col === 1 || i === metaBlocks.length - 1) y -= 32;
    });
    y -= 4;
  }

  for (const block of rest) {
    switch (block.type) {
      case 'rule':
        need(24);
        y -= 10;
        dotRule(y);
        y -= 16;
        break;

      case 'heading':
        // Reserve the heading plus a couple of lines of whatever follows, so a
        // section title is never left stranded at the foot of a page.
        need(86);
        y -= 20;
        drawTracked(page, sanitize(block.text).toUpperCase(), {
          x: MARGIN_X,
          y: y - 9,
          size: 9,
          font: fonts.mono,
          color: INK,
        });
        y -= 18;
        page.drawLine({
          start: { x: MARGIN_X, y },
          end: { x: PAGE.width - MARGIN_X, y },
          thickness: 1,
          color: INK,
        });
        y -= 18;
        break;

      case 'subheading': {
        const numbered = typeof block.index === 'number';
        const indent = numbered ? 34 : 0;
        need(52);
        y -= 6;

        if (numbered) {
          // Two digits, so 1 through 9 align with 10 and above.
          drawTracked(page, String(block.index).padStart(2, '0'), {
            x: MARGIN_X,
            y: y - 11,
            size: 11,
            font: fonts.mono,
            color: ACCENT,
            tracking: 0.5,
          });
        }

        write(block.text, { font: fonts.medium, size: 11, leading: 16, indent });
        y -= 3;
        break;
      }

      case 'paragraph':
        write(block.text, { font: fonts.regular, size: 9.5, leading: 15.5 });
        y -= 8;
        break;

      case 'bullet': {
        // Reserve the wrapped height first, or the marker can be left on one
        // page with its text on the next.
        need(wrap(sanitize(block.text), fonts.regular, 9.5, CONTENT_WIDTH - 18).length * 15.5);
        page.drawRectangle({ x: MARGIN_X + 1, y: y - 8, width: 4, height: 4, color: ACCENT });
        write(block.text, { font: fonts.regular, size: 9.5, leading: 15.5, indent: 18 });
        y -= 4;
        break;
      }

      case 'quote': {
        // Set large and unquoted: the attribution and the rule already say it
        // is a quotation, and quotation marks at this size look like debris.
        const lines = wrap(sanitize(block.text), fonts.regular, 13, CONTENT_WIDTH - 30);
        need(lines.length * 19 + 30);
        const startPage = page;
        const top = y;

        y -= 6;
        write(block.text, { font: fonts.regular, size: 13, leading: 19, indent: 22 });
        y -= 2;

        need(14);
        drawTracked(page, sanitize(block.attribution).toUpperCase(), {
          x: MARGIN_X + 22,
          y: y - 7,
          size: 6.5,
          font: fonts.mono,
          color: GRAY,
        });
        y -= 16;

        // Drawn after the text so its height matches what was actually laid
        // out — and skipped entirely if the quote spilled onto a new page,
        // where `top` would describe the previous one.
        if (page === startPage && top > y) {
          page.drawRectangle({ x: MARGIN_X, y, width: 2, height: top - y, color: ACCENT });
        }
        y -= 10;
        break;
      }

      case 'note':
        y -= 6;
        write(block.text, { font: fonts.regular, size: 8, color: GRAY, leading: 12.5 });
        break;
    }
  }

  // ── Footer band ───────────────────────────────────────────────────────────
  // Drawn last, once the page count is known. The band is black because the
  // supplied logo is white artwork and is not going to be altered to suit the
  // paper; giving it the ground it needs is the honest way round.
  pages.forEach((target, index) => {
    target.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: FOOTER_H, color: INK });

    if (logo) {
      const height = 12;
      const width = (logo.width / logo.height) * height;
      target.drawImage(logo, { x: MARGIN_X, y: (FOOTER_H - height) / 2, width, height });
    } else {
      drawTracked(target, 'KLINEKRAFT', {
        x: MARGIN_X,
        y: FOOTER_H / 2 - 3,
        size: 7,
        font: fonts.mono,
        color: GRAY_LIGHT,
      });
    }

    const stamp = `${index + 1} / ${pages.length}`;
    target.drawText(stamp, {
      x: PAGE.width - MARGIN_X - fonts.mono.widthOfTextAtSize(stamp, 7.5),
      y: FOOTER_H / 2 - 3,
      size: 7.5,
      font: fonts.mono,
      color: GRAY_LIGHT,
    });
  });

  return pdf.save();
}
