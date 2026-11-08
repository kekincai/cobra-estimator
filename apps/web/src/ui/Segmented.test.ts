import { describe, expect, it } from 'vitest';
import { nextSegIndex } from './Segmented';

describe('nextSegIndex（Segmented radio の方向キー）', () => {
  it('→ / ↓ で次へ、端で先頭へ循環', () => {
    expect(nextSegIndex('ArrowRight', 0, 4)).toBe(1);
    expect(nextSegIndex('ArrowDown', 2, 4)).toBe(3);
    expect(nextSegIndex('ArrowRight', 3, 4)).toBe(0);
  });
  it('← / ↑ で前へ、先頭から末尾へ循環', () => {
    expect(nextSegIndex('ArrowLeft', 1, 4)).toBe(0);
    expect(nextSegIndex('ArrowUp', 0, 4)).toBe(3);
  });
  it('Home / End', () => {
    expect(nextSegIndex('Home', 2, 4)).toBe(0);
    expect(nextSegIndex('End', 0, 4)).toBe(3);
  });
  it('選択なし（-1）は先頭を起点にする', () => {
    expect(nextSegIndex('ArrowRight', -1, 3)).toBe(1);
    expect(nextSegIndex('ArrowLeft', -1, 3)).toBe(2);
  });
  it('単一要素・空・対象外のキー', () => {
    expect(nextSegIndex('ArrowRight', 0, 1)).toBe(0);
    expect(nextSegIndex('ArrowRight', 0, 0)).toBeNull();
    expect(nextSegIndex('Enter', 0, 4)).toBeNull();
    expect(nextSegIndex('Tab', 0, 4)).toBeNull();
  });
});
