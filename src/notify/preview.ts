import type {
  PreviewIssue,
  PreviewRequest,
  PreviewResult,
  SampleView,
  Variable,
} from '../shared/api.js';
import type { MessageKind } from '../shared/notify.js';
import { imageItemFor, messageLabel, waitingPlan } from './compose.js';
import { buildContext, sampleContext } from './context.js';
import type { Attachment } from './discord.js';
import { checkTemplate, mentionPayload, renderEmbed, type RenderedEmbed } from './message.js';
import type { NotifyService } from './service.js';
import { ifConditions, TemplateError, type Value } from './template/index.js';

export type SampleImage = (image: 'poster' | 'backdrop') => Attachment | undefined;

export interface Preview extends PreviewResult {
  imageItemId: string | null;
  attachment?: Attachment;
}

interface SampleContext {
  id: string;
  label: string;
  context: Record<string, Value>;
  imageItemId: string | null;
}

const SAMPLE_ID = 'sample';

const time = (at: string) =>
  new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function flatten(value: Value, prefix: string, out: Variable[]) {
  if (Array.isArray(value)) {
    out.push({ path: prefix, value: `${value.length} item${value.length === 1 ? '' : 's'}` });
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  out.push({ path: prefix, value: value === null ? '' : String(value) });
}

function lookup(context: Record<string, Value>, path: string): Value | undefined {
  let cur: Value | undefined = context;
  for (const part of path.split('.')) {
    cur =
      cur !== null && typeof cur === 'object' && !Array.isArray(cur)
        ? (cur as Record<string, Value>)[part]
        : undefined;
  }
  return cur;
}

function skippedIfs(sources: string[], context: Record<string, Value>): string[] {
  const empty = sources.flatMap(ifConditions).filter((path) => {
    const value = lookup(context, path);
    return value === null || value === '' || value === undefined;
  });
  return [...new Set(empty)].map(
    (path) => `\`${path}\` is empty here, so its if-block is skipped.`,
  );
}

function imageUrlFor(
  image: 'poster' | 'backdrop' | null,
  imageItemId: string | null,
  sample: boolean,
): string | null {
  if (!image) return null;
  if (sample) return `/samples/${image}.jpg`;
  return imageItemId ? `/api/notifications/image/${imageItemId}?type=${image}` : null;
}

export class NotifyPreview {
  constructor(
    private readonly notify: NotifyService,
    private readonly sampleImage: SampleImage,
  ) {}

  samples(kind: MessageKind): SampleView[] {
    return [
      ...this.notify.recent
        .filter((r) => r.kind === kind)
        .map((r) => ({ id: r.id, label: `${r.label} · received ${time(r.at)}` })),
      ...this.#waiting(kind).map((w) => ({ id: w.id, label: w.label })),
      { id: SAMPLE_ID, label: 'Sample data' },
    ];
  }

  render({ kind, template, sampleId }: PreviewRequest): Preview {
    const check = checkTemplate(kind, template);
    const issues: PreviewIssue[] = [
      ...check.title.map((i) => ({ ...i, field: 'title' as const })),
      ...check.content.map((i) => ({ ...i, field: 'content' as const })),
    ];
    const found = this.#contextFor(kind, sampleId);
    const sample = !found;
    const { context, imageItemId } = found ?? { context: sampleContext(kind), imageItemId: null };
    let embed: RenderedEmbed | null = null;
    let error: string | null = null;
    if (!issues.length) {
      try {
        embed = renderEmbed(template, context);
      } catch (err) {
        if (!(err instanceof TemplateError)) throw err;
        error = err.message;
      }
    }
    const variables: Variable[] = [];
    flatten(context, '', variables);
    const image = template.image === 'none' ? null : template.image;
    const { settings } = this.notify;
    return {
      embed,
      issues,
      warnings: check.warnings,
      notes: issues.length ? [] : skippedIfs([template.title, template.content], context),
      error,
      imageUrl: imageUrlFor(image, imageItemId, sample),
      imageItemId,
      attachment: sample && image ? this.sampleImage(image) : undefined,
      username: settings.username,
      mention: mentionPayload(settings.mention).content ?? null,
      variables,
    };
  }

  #contextFor(kind: MessageKind, sampleId: string): SampleContext | undefined {
    if (sampleId === SAMPLE_ID) return undefined;
    return (
      this.notify.recent.find((r) => r.id === sampleId && r.kind === kind) ??
      this.#waiting(kind).find((w) => w.id === sampleId)
    );
  }

  #waiting(kind: MessageKind): SampleContext[] {
    const batch = this.notify.store.state.batch;
    if (!batch) return [];
    const { composer } = this.notify;
    return waitingPlan(batch.items)
      .filter((m) => m.kind === kind || (kind === 'season' && m.kind === 'episodes'))
      .map((m, i) => ({
        id: `waiting-${i}-${m.items[0]?.id ?? ''}`,
        label: `${messageLabel(m)} · waiting`,
        context: buildContext(
          kind === 'season' ? { ...m, kind: 'season' } : m,
          composer.detailsFor(m, new Map()),
        ),
        imageItemId: imageItemFor(m, 'poster'),
      }));
  }
}
