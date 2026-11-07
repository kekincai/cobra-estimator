// テスト（Vitest / Node）で Shift-JIS の fixture をバイト列のまま読むためだけの最小宣言。
// tsconfig.app は @types/node を読まないので、使う関数だけ宣言する。
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
