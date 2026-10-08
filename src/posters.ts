const TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const;

export type PosterType = (typeof TYPES)[keyof typeof TYPES];

export const POSTER_NAME_RULE = 'a plain file name ending in .png, .jpg, .jpeg or .webp';

const POSTER_NAME = /^[^./\\][^/\\]*\.(png|jpe?g|webp)$/i;

export function isPosterName(file: string): boolean {
  return POSTER_NAME.test(file);
}

export function posterType(file: string): PosterType {
  const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return TYPES[extension as keyof typeof TYPES] ?? 'image/jpeg';
}

export function detectPosterType(bytes: Uint8Array): PosterType | undefined {
  const startsWith = (offset: number, ...expected: number[]) =>
    expected.every((value, i) => bytes[offset + i] === value);
  if (startsWith(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (startsWith(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0, 0x52, 0x49, 0x46, 0x46) && startsWith(8, 0x57, 0x45, 0x42, 0x50)) {
    return 'image/webp';
  }
  return undefined;
}
