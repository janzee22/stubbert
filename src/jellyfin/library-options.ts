interface TypeOptions {
  Type: string;
  MetadataFetchers?: string[] | null;
  MetadataFetcherOrder?: string[] | null;
  ImageFetchers?: string[] | null;
  ImageFetcherOrder?: string[] | null;
  [key: string]: unknown;
}

export interface LibraryOptions {
  TypeOptions?: TypeOptions[] | null;
  [key: string]: unknown;
}

export function boxSetFetchers(options: LibraryOptions | null | undefined): string[] {
  const box = options?.TypeOptions?.find((t) => t.Type === 'BoxSet');
  return [
    ...(box?.MetadataFetchers ?? []).map((f) => `metadata: ${f}`),
    ...(box?.ImageFetchers ?? []).map((f) => `images: ${f}`),
  ];
}

export function withoutBoxSetFetchers(options: LibraryOptions | null | undefined): LibraryOptions {
  const none = {
    MetadataFetchers: [],
    MetadataFetcherOrder: [],
    ImageFetchers: [],
    ImageFetcherOrder: [],
  };
  const types = options?.TypeOptions ?? [];
  const box = types.find((t) => t.Type === 'BoxSet');
  return {
    ...options,
    TypeOptions: box
      ? types.map((t) => (t === box ? { ...t, ...none } : t))
      : [...types, { Type: 'BoxSet', ...none }],
  };
}
