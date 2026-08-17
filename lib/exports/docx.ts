import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx';
import type { RecapDocument } from './document';

/**
 * DOCX rendering.
 *
 * Styled to match the PDF rather than left as Word defaults — this is a
 * document someone forwards to a client, so it should not look like an export.
 */

const INK = '0A0A0A';
const GRAY = '6B6863';
const ACCENT = 'D6202A';

export async function toDocx(doc: RecapDocument): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'SIGNAL // MEDIA INTELLIGENCE',
          bold: true,
          size: 15, // half-points
          color: GRAY,
          characterSpacing: 30,
        }),
      ],
    }),
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 60 },
      children: [new TextRun({ text: doc.title, bold: true, size: 42, color: INK })],
    }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: doc.subtitle.toUpperCase(),
          bold: true,
          size: 15,
          color: ACCENT,
          characterSpacing: 30,
        }),
      ],
    }),
  );

  for (const block of doc.blocks) {
    switch (block.type) {
      case 'meta':
        children.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: 1700 }],
            spacing: { after: 40 },
            children: [
              new TextRun({ text: block.label.toUpperCase(), bold: true, size: 14, color: GRAY }),
              new TextRun({ text: '\t' + block.value, size: 18, color: INK }),
            ],
          }),
        );
        break;

      case 'rule':
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 160 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D8D6D2' } },
            children: [],
          }),
        );
        break;

      case 'heading':
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 320, after: 120 },
            children: [
              new TextRun({
                text: block.text.toUpperCase(),
                bold: true,
                size: 22,
                color: INK,
                characterSpacing: 20,
              }),
            ],
          }),
        );
        break;

      case 'subheading':
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 160, after: 60 },
            children: [
              // Numbered as literal text rather than a Word list, so the
              // sequence matches the PDF exactly and cannot be renumbered by
              // the editor when someone reorders or deletes an item.
              ...(typeof block.index === 'number'
                ? [
                    new TextRun({
                      text: `${String(block.index).padStart(2, '0')}  `,
                      bold: true,
                      size: 20,
                      color: ACCENT,
                    }),
                  ]
                : []),
              new TextRun({ text: block.text, bold: true, size: 20, color: INK }),
            ],
          }),
        );
        break;

      case 'paragraph':
        children.push(
          new Paragraph({
            spacing: { after: 140, line: 300 },
            children: [new TextRun({ text: block.text, size: 19, color: INK })],
          }),
        );
        break;

      case 'bullet':
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80, line: 280 },
            children: [new TextRun({ text: block.text, size: 19, color: INK })],
          }),
        );
        break;

      case 'quote':
        children.push(
          new Paragraph({
            indent: { left: 340 },
            spacing: { before: 120, after: 40, line: 300 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 12 } },
            children: [
              new TextRun({ text: `“${block.text}”`, italics: true, size: 20, color: INK }),
            ],
          }),
          new Paragraph({
            indent: { left: 340 },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: block.attribution, bold: true, size: 15, color: GRAY }),
            ],
          }),
        );
        break;

      case 'note':
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: block.text, italics: true, size: 16, color: GRAY })],
          }),
        );
        break;
    }
  }

  const document = new Document({
    title: doc.title,
    creator: 'SIGNAL — KLINEKRAFT',
    description: doc.subtitle,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 19, color: INK } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}
