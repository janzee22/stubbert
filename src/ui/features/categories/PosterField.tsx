import { useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Dialog, ErrorText, Icon, PosterThumb } from '../../components/index.js';
import { usePosters } from '../../state/posters.js';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function PosterField({
  categoryId,
  name,
  poster,
  onChange,
}: {
  categoryId: string;
  name: string;
  poster?: string;
  onChange: (poster: string | undefined) => void;
}) {
  const { posters, refreshPosters, noteUpload } = usePosters();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<unknown>();
  const fileInput = useRef<HTMLInputElement>(null);
  const missing = !!poster && !posters.some((p) => p.file === poster);

  const upload = async (file: File) => {
    const ext = EXTENSIONS[file.type];
    if (!ext) {
      setError(new Error('Use a PNG, JPEG or WebP image.'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const target = `${categoryId || 'poster'}.${ext}`;
      await api.uploadPoster(target, file);
      await refreshPosters();
      noteUpload(target);
      onChange(target);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const choose = (file: string | undefined) => {
    onChange(file);
    setChoosing(false);
  };

  return (
    <div className="editor__poster">
      <PosterThumb file={poster} name={name || '?'} size="lg" />
      <div className="col gap-8 grow">
        <span className="label">Poster</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
        />
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <Icon name="upload" />
          {busy ? 'Uploading…' : 'Upload image…'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setChoosing(true)}
          disabled={!posters.length && !poster}
        >
          <Icon name="image" />
          Choose uploaded…
        </button>
        {missing && (
          <p className="error-msg">
            <Icon name="alert" size={16} strokeWidth={2.5} />
            {poster} isn’t in the posters folder.
          </p>
        )}
        <p className="help">Portrait 2:3, like 1000×1500. Jellyfin gets it on the next sync.</p>
        <ErrorText error={error} />
      </div>
      <Dialog
        open={choosing}
        onClose={() => setChoosing(false)}
        icon="image"
        title="Choose a poster"
        actions={
          <>
            {poster && (
              <button type="button" className="btn btn--ghost" onClick={() => choose(undefined)}>
                Use no poster
              </button>
            )}
            <button type="button" className="btn btn--secondary" onClick={() => setChoosing(false)}>
              Cancel
            </button>
          </>
        }
      >
        <ul className="poster-grid">
          {posters.map((p) => (
            <li key={p.file}>
              <button
                type="button"
                className="walltile"
                aria-pressed={p.file === poster}
                onClick={() => choose(p.file)}
              >
                <PosterThumb file={p.file} name={p.file} size="md" />
                <span className="walltile__meta">{p.file}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
