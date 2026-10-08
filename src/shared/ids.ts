export function normId(id: string): string;
export function normId(id: string | null | undefined): string | undefined;
export function normId(id: string | null | undefined): string | undefined {
  return id?.replace(/-/g, '').toLowerCase();
}
