import { describe, expect, it } from 'vitest';
import { activeCaption, CAPTION_STYLES, groupWords, snapToWord, timecode, type Word } from '../src/clips/captions';
import { validateRenderEdit } from '../supabase/functions/_shared/clip-edit';

const w = (start: number, text: string): Word => ({ start, end: start + 0.3, text });

describe('groupWords (mirrors worker caption_groups)', () => {
  it('splits by word count and character width, skipping blanks', () => {
    const words = [w(0, ' the'), w(0.4, ' biggest'), w(0.8, ' '), w(1.2, ' mistake'), w(1.6, ' ever')];
    expect(groupWords(words, 3).map((g) => g.map((x) => x.text.trim()))).toEqual([['the', 'biggest'], ['mistake', 'ever']]);
  });
  it('one word per group for pop style', () => {
    expect(groupWords([w(0, 'a'), w(1, 'b')], 1)).toHaveLength(2);
  });
});

describe('activeCaption', () => {
  const groups = groupWords([w(1, 'one'), w(1.5, 'two'), w(2, 'three'), w(5, 'four')], 3);
  it('finds the spoken word', () => {
    expect(activeCaption(groups, 1.6)).toMatchObject({ index: 1 });
  });
  it('returns null in silence', () => {
    expect(activeCaption(groups, 3.5)).toBeNull();
  });
});

describe('snapToWord', () => {
  const words = [w(10, 'a'), w(11, 'b')];
  it('snaps within tolerance', () => {
    expect(snapToWord(words, 10.9, 'start')).toBe(11);
    expect(snapToWord(words, 10.25, 'end')).toBe(10.3);
  });
  it('leaves far times alone', () => {
    expect(snapToWord(words, 20, 'start')).toBe(20);
  });
});

describe('caption style data', () => {
  it('has unique ids including none', () => {
    const ids = CAPTION_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('none');
  });
});

describe('validateRenderEdit (shared with the clips-render function)', () => {
  const ok = { start: 10, end: 40, captionStyle: 'clean', aspect: '1:1', cropX: 0.25, title: '  Hi  ' };
  it('accepts a valid edit and normalises it', () => {
    const r = validateRenderEdit(ok, 600);
    expect(r).toEqual({ ok: true, edit: { start: 10, end: 40, captionStyle: 'clean', aspect: '1:1', cropX: 0.25, title: 'Hi' } });
  });
  it.each([
    [{ ...ok, end: 9 }, 'bad_range'],
    [{ ...ok, end: 11 }, 'too_short'],
    [{ ...ok, end: 400 }, 'too_long'],
    [{ ...ok, end: 700 }, 'bad_range'],
    [{ ...ok, captionStyle: 'comic' }, 'bad_style'],
    [{ ...ok, aspect: '2:1' }, 'bad_aspect'],
    [{ ...ok, cropX: 2 }, 'bad_crop'],
  ])('rejects %o', (body, error) => {
    expect(validateRenderEdit(body as Record<string, unknown>, 600)).toMatchObject({ ok: false, error });
  });
  it('null cropX means follow the face', () => {
    expect(validateRenderEdit({ ...ok, cropX: null }, 600)).toMatchObject({ ok: true, edit: { cropX: null } });
  });
});

describe('timecode', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(timecode(65.47)).toBe('1:05.4');
    expect(timecode(5, false)).toBe('0:05');
  });
});
