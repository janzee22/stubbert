import { call, finishedRun, get, h, post } from './harness.js';
import { describe, expect, it } from 'vitest';

describe('deleting a managed collection', () => {
  it('needs the category id as confirmation and only deletes managed collections', async () => {
    await finishedRun((await post('/api/sync')).json().id);
    const horror = h.fake.categories().find((c) => c.Name === 'Horror')!;
    expect((await get('/api/categories/horror/collection')).json()).toMatchObject({
      name: 'Horror',
      memberCount: 1,
    });

    const del = (id: string, confirm?: string) =>
      call({
        method: 'DELETE',
        url: `/api/categories/${id}/collection`,
        payload: confirm ? { confirm } : {},
      });
    expect((await del('horror')).statusCode).toBe(400);
    expect((await del('horror', 'disney')).statusCode).toBe(400);
    expect((await del('unknown', 'unknown')).json()).toMatchObject({ code: 'not-managed' });

    expect((await del('horror', 'horror')).statusCode).toBe(200);
    expect(h.fake.items.has(horror.Id)).toBe(false);
    expect(await h.data.loadState()).not.toHaveProperty('horror');
    expect([...h.fake.items.values()].some((i) => i.Name === 'Halloween')).toBe(true);
  });
});
