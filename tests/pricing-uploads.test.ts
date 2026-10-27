import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));

import { clampVideoSeconds, creditCost } from '../supabase/functions/_shared/pricing';
import { checkUpload, safeObjectName } from '../src/lib/uploads';

describe('creditCost', () => {
  it('charges a flat 3 credits per image', () => {
    expect(creditCost('image', '1080p', null)).toBe(3);
  });
  it('charges per started 5-second span by resolution', () => {
    expect(creditCost('video', '720p', 5)).toBe(16);
    expect(creditCost('video', '720p', 10)).toBe(32);
    expect(creditCost('video', '1080p', 6)).toBe(64);
  });
  it('clamps video length to 5-10 seconds', () => {
    expect(clampVideoSeconds(1)).toBe(5);
    expect(clampVideoSeconds(99)).toBe(10);
    expect(clampVideoSeconds('abc')).toBe(5);
  });
});

describe('checkUpload', () => {
  const mb = 1024 * 1024;
  it('accepts an MP4 inside the plan limit', () => {
    expect(checkUpload({ name: 'a.mp4', type: 'video/mp4', size: 10 * mb }, 'free')).toEqual({ ok: true });
  });
  it('rejects unsupported types', () => {
    expect(checkUpload({ name: 'a.exe', type: 'application/x-msdownload', size: 10 }, 'pro').ok).toBe(false);
  });
  it('rejects files over the plan limit', () => {
    expect(checkUpload({ name: 'a.mp4', type: 'video/mp4', size: 600 * mb }, 'free').ok).toBe(false);
    expect(checkUpload({ name: 'a.mp4', type: 'video/mp4', size: 600 * mb }, 'starter').ok).toBe(true);
  });
  it('rejects empty files', () => {
    expect(checkUpload({ name: 'a.mp4', type: 'video/mp4', size: 0 }, 'pro').ok).toBe(false);
  });
});

describe('safeObjectName', () => {
  it('strips unsafe characters and keeps the extension', () => {
    expect(safeObjectName('My Podcast #12 (final).MP4')).toBe('my-podcast-12-final.mp4');
    expect(safeObjectName('../../etc/passwd')).toBe('passwd.bin');
  });
});
