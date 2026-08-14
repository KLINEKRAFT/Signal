import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { RecapDocument } from './document';

/**
 * PDF rendering with pdf-lib.
 *
 * Chosen over a headless-browser or LaTeX pipeline because it is pure JS with
 * no binaries, which is what makes it viable inside a serverless function. The
 * standard fonts are Helvetica rather than the app's display face — embedding a
 * webfont would add weight for a document nobody reads on screen.
 */

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 64;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const INK = rgb(0.04, 0.04, 0.04);
const GRAY = rgb(0.45, 0.44, 0.42);
const LINE = rgb(0.85, 0.84, 0.82);
const ACCENT = rgb(0.84, 0.13, 0.16);

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

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
 * The standard PDF fonts encode WinAnsi, which covers Latin-1 plus the
 * typographic characters this product actually uses — curly quotes, en and em
 * dashes, the ellipsis, the middle dot. Those are kept, because replacing an em
 * dash with a hyphen in a document someone forwards to a client is a visible
 * downgrade. Anything genuinely outside the encoding is dropped rather than
 * allowed to throw mid-render.
 */
const WIN_ANSI_EXTRAS = '‘’“”–—…•·€‚„†‡‰‹›™';

function sanitize(text: string): string {
  const allowed = new RegExp(`[^\\x20-\\x7E\\xA0-\\xFF\\n${WIN_ANSI_EXTRAS}]`, 'g');
  return text.replace(allowed, '');
}

export async function toPdf(doc: RecapDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setProducer('SIGNAL');
  pdf.setCreator('SIGNAL — KLINEKRAFT');

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const need = (space: number) => {
    if (y - space >= MARGIN) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };

  const write = (
    text: string,
    opts: { font: PDFFont; size: number; color?: typeof INK; leading?: number; indent?: number },
  ) => {
    const indent = opts.indent ?? 0;
    const leading = opts.leading ?? opts.size * 1.45;
    for (const line of wrap(sanitize(text), opts.font, opts.size, CONTENT_WIDTH - indent)) {
      need(leading);
      page.drawText(line, {
        x: MARGIN + indent,
        y: y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color ?? INK,
      });
      y -= leading;
    }
  };

  // ── Masthead ────────────────────────────────────────────────────────────
  page.drawText('SIGNAL // MEDIA INTELLIGENCE', {
    x: MARGIN,
    y: y - 8,
    size: 7.5,
    font: fonts.bold,
    color: GRAY,
  });
  y -= 28;

  write(doc.title, { font: fonts.bold, size: 21, leading: 26 });
  y -= 4;
  write(doc.subtitle.toUpperCase(), { font: fonts.bold, size: 7.5, color: ACCENT, leading: 14 });
  y -= 10;

  for (const block of doc.blocks) {
    switch (block.type) {
      case 'meta': {
        need(13);
        const label = sanitize(block.label.toUpperCase());
        page.drawText(label, { x: MARGIN, y: y - 8, size: 7, font: fonts.bold, color: GRAY });
        page.drawText(sanitize(block.value).slice(0, 90), {
          x: MARGIN + 92,
          y: y - 8,
          size: 8.5,
          font: fonts.regular,
          color: INK,
        });
        y -= 14;
        break;
      }

      case 'rule':
        need(20);
        y -= 8;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE.width - MARGIN, y },
          thickness: 0.5,
          color: LINE,
        });
        y -= 14;
        break;

      case 'heading':
        // Reserve the heading plus a couple of lines of whatever follows it, so
        // a section title is never left stranded at the foot of a page.
        need(72);
        y -= 12;
        write(block.text.toUpperCase(), { font: fonts.bold, size: 11, leading: 18 });
        y -= 2;
        break;

      case 'subheading':
        need(48);
        y -= 4;
        write(block.text, { font: fonts.bold, size: 10, leading: 15 });
        break;

      case 'paragraph':
        write(block.text, { font: fonts.regular, size: 9.5, leading: 15 });
        y -= 7;
        break;

      case 'bullet': {
        // Reserve the wrapped height first, or the marker can be left on one
        // page with its text on the next.
        need(wrap(sanitize(block.text), fonts.regular, 9.5, CONTENT_WIDTH - 14).length * 15);
        page.drawText('-', { x: MARGIN, y: y - 9.5, size: 9.5, font: fonts.regular, color: ACCENT });
        write(block.text, { font: fonts.regular, size: 9.5, leading: 15, indent: 14 });
        y -= 2;
        break;
      }

      case 'quote': {
        const lines = wrap(sanitize(block.text), fonts.italic, 10, CONTENT_WIDTH - 18);
        need(lines.length * 16 + 18);
        const startPage = page;
        const top = y;
        write(`"${block.text}"`, { font: fonts.italic, size: 10, leading: 16, indent: 14 });
        write(block.attribution, {
          font: fonts.bold,
          size: 7.5,
          color: GRAY,
          leading: 13,
          indent: 14,
        });
        // Drawn after the text so its height matches what was actually laid
        // out — and skipped entirely if the quote still spilled onto a new
        // page, where `top` would describe the previous one.
        if (page === startPage && top > y) {
          page.drawRectangle({ x: MARGIN, y, width: 1.5, height: top - y, color: ACCENT });
        }
        y -= 8;
        break;
      }

      case 'note':
        y -= 4;
        write(block.text, { font: fonts.italic, size: 8, color: GRAY, leading: 12 });
        break;
    }
  }

  // ── Page numbers ────────────────────────────────────────────────────────
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`${index + 1} / ${pages.length}`, {
      x: PAGE.width - MARGIN - 30,
      y: MARGIN - 24,
      size: 7,
      font: fonts.regular,
      color: GRAY,
    });
  });

  return pdf.save();
}
