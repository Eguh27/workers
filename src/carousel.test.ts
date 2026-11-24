import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishCarousel, type CarouselDeps } from './carousel';

/** mock Graph API: mencatat urutan panggilan, mengembalikan id berurutan */
function mockDeps(fail?: { at: 'child' | 'parent' | 'publish' }) {
  const calls: { path: string; params: Record<string, string> }[] = [];
  let n = 0;
  const deps: CarouselDeps = {
    post: async (path, params) => {
      calls.push({ path, params });
      if (fail?.at === 'child' && params.is_carousel_item) throw new Error('child gagal');
      if (fail?.at === 'parent' && params.media_type === 'CAROUSEL') throw new Error('parent gagal');
      return { id: `id${++n}` };
    },
    publish: async (creationId) => {
      calls.push({ path: 'media_publish', params: { creation_id: creationId } });
      if (fail?.at === 'publish') throw new Error('publish gagal');
      return 'media-42';
    },
  };
  return { deps, calls };
}

test('tiga slide → tiga child dulu, baru satu parent CAROUSEL berisi ketiga id', () => {
  const { deps, calls } = mockDeps();
  return publishCarousel(['u1', 'u2', 'u3'], 'caption fess', deps).then((mediaId) => {
    assert.equal(mediaId, 'media-42');
    const children = calls.filter((c) => c.params.is_carousel_item === 'true');
    const parent = calls.find((c) => c.params.media_type === 'CAROUSEL');
    assert.equal(children.length, 3);
    assert.deepEqual(children.map((c) => c.params.image_url), ['u1', 'u2', 'u3']);
    assert.ok(parent);
    // child dibuat SEBELUM parent
    assert.ok(calls.indexOf(parent!) > calls.indexOf(children[2]));
    assert.equal(parent!.params.children, 'id1,id2,id3');
    assert.equal(parent!.params.caption, 'caption fess');
  });
});

test('caption hanya di parent, tidak di child', () => {
  const { deps, calls } = mockDeps();
  return publishCarousel(['u1', 'u2'], 'caption fess', deps).then(() => {
    for (const c of calls.filter((c) => c.params.is_carousel_item)) {
      assert.equal(c.params.caption, undefined);
    }
  });
});

test('child gagal → tidak ada parent yang dibuat dan error dilempar', async () => {
  const { deps, calls } = mockDeps({ at: 'child' });
  await assert.rejects(() => publishCarousel(['u1', 'u2'], 'c', deps), /child gagal/);
  assert.equal(calls.filter((c) => c.params.media_type === 'CAROUSEL').length, 0);
  assert.equal(calls.filter((c) => c.path === 'media_publish').length, 0);
});

test('parent gagal → tidak ada publish yang dicoba', async () => {
  const { deps, calls } = mockDeps({ at: 'parent' });
  await assert.rejects(() => publishCarousel(['u1', 'u2'], 'c', deps), /parent gagal/);
  assert.equal(calls.filter((c) => c.path === 'media_publish').length, 0);
});

test('satu url tetap dibuatkan carousel (pemanggil yang memilih alur single)', () => {
  const { deps, calls } = mockDeps();
  return publishCarousel(['u1'], 'c', deps).then(() => {
    assert.equal(calls.filter((c) => c.params.is_carousel_item === 'true').length, 1);
    assert.equal(calls.filter((c) => c.params.media_type === 'CAROUSEL').length, 1);
  });
});
