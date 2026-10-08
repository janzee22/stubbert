export const MESSAGE_KINDS = ['movie', 'episode', 'episodes', 'season'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export function isMessageKind(value: unknown): value is MessageKind {
  return MESSAGE_KINDS.some((kind) => kind === value);
}

export const IMAGE_CHOICES = ['poster', 'backdrop', 'none'] as const;
export type ImageChoice = (typeof IMAGE_CHOICES)[number];

export interface MessageTemplate {
  title: string;
  content: string;
  image: ImageChoice;
  color: string;
}
