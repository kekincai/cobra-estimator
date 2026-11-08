import { describe, expect, it } from 'vitest';
import { guardChange } from './users';

const all = [
  { email: 'a@example.com', role: 'admin' as const },
  { email: 'b@example.com', role: 'estimator' as const },
];

describe('guardChange', () => {
  it('他の利用者の権限変更・削除はできる', () => {
    expect(guardChange(all, 'a@example.com', 'b@example.com', 'pmo')).toBeNull();
    expect(guardChange(all, 'a@example.com', 'b@example.com', 'deleted')).toBeNull();
  });
  it('自分自身は削除・権限変更できない', () => {
    expect(guardChange(all, 'a@example.com', 'a@example.com', 'deleted')).toMatch('自分自身');
    expect(guardChange(all, 'a@example.com', 'a@example.com', 'estimator')).toMatch('自分自身');
    expect(guardChange(all, 'a@example.com', 'a@example.com', 'admin')).toBeNull();
  });
  it('最後のモデル管理者は外せない', () => {
    expect(guardChange(all, 'x@example.com', 'a@example.com', 'pmo')).toMatch('1 人もいなくなる');
    const two = [...all, { email: 'c@example.com', role: 'admin' as const }];
    expect(guardChange(two, 'c@example.com', 'a@example.com', 'deleted')).toBeNull();
  });
  it('未登録は対象外', () => {
    expect(guardChange(all, 'a@example.com', 'z@example.com', 'deleted')).toMatch('登録されていません');
  });
});
