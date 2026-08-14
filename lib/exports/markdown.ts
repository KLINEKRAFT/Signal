import type { RecapDocument } from './document';

/** Markdown and plain text differ only in decoration, so they share a walk. */
function render(doc: RecapDocument, plain: boolean): string {
  const out: string[] = [];
  const meta: string[] = [];

  out.push(plain ? doc.title.toUpperCase() : `# ${doc.title}`);
  out.push('');

  for (const block of doc.blocks) {
    switch (block.type) {
      case 'meta':
        meta.push(plain ? `${block.label}: ${block.value}` : `**${block.label}** ${block.value}`);
        break;

      case 'rule':
        if (meta.length) {
          out.push(meta.join(plain ? '\n' : '  \n'));
          meta.length = 0;
        }
        out.push('', plain ? '---' : '---', '');
        break;

      case 'heading':
        out.push('', plain ? block.text.toUpperCase() : `## ${block.text}`, '');
        break;

      case 'subheading':
        out.push(plain ? block.text : `### ${block.text}`, '');
        break;

      case 'paragraph':
        out.push(block.text, '');
        break;

      case 'bullet':
        out.push(plain ? `- ${block.text}` : `- ${block.text}`);
        break;

      case 'quote':
        out.push(
          plain ? `"${block.text}"` : `> ${block.text}`,
          plain ? `    — ${block.attribution}` : `>\n> — *${block.attribution}*`,
          '',
        );
        break;

      case 'note':
        out.push(plain ? block.text : `*${block.text}*`, '');
        break;
    }
  }

  if (meta.length) out.push(meta.join(plain ? '\n' : '  \n'));

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toMarkdown(doc: RecapDocument): string {
  return render(doc, false);
}

export function toPlainText(doc: RecapDocument): string {
  return render(doc, true);
}
