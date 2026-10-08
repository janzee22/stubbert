export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === '\n') line++;
  return line;
}

export class TemplateError extends Error {
  readonly line: number;

  constructor(
    readonly reason: string,
    source: string,
    readonly offset: number,
    readonly end = offset,
  ) {
    const line = lineOf(source, offset);
    super(`Line ${line}: ${reason}${/[.?!]$/.test(reason) ? '' : '.'}`);
    this.line = line;
  }
}
