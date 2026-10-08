import { useEffect, useState } from 'react';
import {
  api,
  type MessageKind,
  type MessageTemplate,
  type PreviewResult,
} from '../../../lib/api.js';

const PREVIEW_DELAY_MS = 300;

export function usePreview(
  kind: MessageKind,
  template: MessageTemplate | undefined,
  sampleId: string,
) {
  const [preview, setPreview] = useState<PreviewResult>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.previewMessage({ kind, template, sampleId }).then(
        (p) => {
          if (cancelled) return;
          setPreview(p);
          setError(undefined);
        },
        (err: unknown) => {
          if (!cancelled) setError(err);
        },
      );
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, template, sampleId]);
  return { preview, error };
}
