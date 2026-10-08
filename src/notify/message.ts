import type { ImageChoice, MessageKind, MessageTemplate } from '../shared/notify.js';
import { DEFAULT_TEMPLATES } from './defaults.js';
import {
  clip,
  render,
  TemplateError,
  validate,
  type TemplateIssue,
  type Value,
} from './template/index.js';
import { sampleContext } from './context.js';

export const LIMITS = { title: 256, description: 4096, total: 6000, content: 2000 };

export type Mention = { type: 'none' } | { type: 'everyone' } | { type: 'role'; roleId: string };

export interface RenderedEmbed {
  title: string;
  description: string;
  color: number;
  image: ImageChoice;
}

export interface RenderOutcome {
  embed: RenderedEmbed;
  fallback?: string;
}

export function colorNumber(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? Number.parseInt(m[1] as string, 16) : 0xffbe2e;
}

export function renderEmbed(
  template: MessageTemplate,
  context: Record<string, Value>,
): RenderedEmbed {
  const title = clip(render(template.title, context).replace(/\s*\n\s*/g, ' '), LIMITS.title);
  const room = Math.min(LIMITS.description, LIMITS.total - title.length);
  const description = clip(render(template.content, context), room);
  return { title, description, color: colorNumber(template.color), image: template.image };
}

export function renderMessage(
  kind: MessageKind,
  template: MessageTemplate,
  context: Record<string, Value>,
): RenderOutcome {
  try {
    return { embed: renderEmbed(template, context) };
  } catch (err) {
    if (!(err instanceof TemplateError)) throw err;
    const fallback = DEFAULT_TEMPLATES[kind];
    return {
      embed: renderEmbed({ ...fallback, image: template.image, color: template.color }, context),
      fallback: err.message,
    };
  }
}

export interface TemplateCheck {
  issues: TemplateIssue[];
  title: TemplateIssue[];
  content: TemplateIssue[];
  warnings: string[];
}

export function checkTemplate(kind: MessageKind, template: MessageTemplate): TemplateCheck {
  const shape = sampleContext(kind);
  const title = validate(template.title, shape);
  const content = validate(template.content, shape);
  const warnings: string[] = [];
  if (!title.length && !content.length) {
    try {
      const t = render(template.title, shape);
      const c = render(template.content, shape);
      if (t.length > LIMITS.title) {
        warnings.push(
          `The title renders to ${t.length} characters with the sample; Discord allows ${LIMITS.title}, so it gets cut.`,
        );
      }
      if (c.length > LIMITS.description) {
        warnings.push(
          `The content renders to ${c.length} characters with the sample; Discord allows ${LIMITS.description}, so it gets cut.`,
        );
      }
      if (!t.trim() && !c.trim()) {
        warnings.push('Both title and content render empty with the sample.');
      }
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      warnings.push(err.message);
    }
  }
  return { issues: [...title, ...content], title, content, warnings };
}

export function mentionPayload(mention: Mention): {
  content?: string;
  allowed_mentions: { parse: string[]; roles?: string[] };
} {
  if (mention.type === 'everyone') {
    return { content: '@everyone', allowed_mentions: { parse: ['everyone'] } };
  }
  if (mention.type === 'role') {
    return {
      content: `<@&${mention.roleId}>`,
      allowed_mentions: { parse: [], roles: [mention.roleId] },
    };
  }
  return { allowed_mentions: { parse: [] } };
}
