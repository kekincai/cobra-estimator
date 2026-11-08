// 下流画面（条件・リスク・レポート）へのリンク。選択中の世代を ?gen=<label> で渡す（FIX 約定 §3）。
// サンプル表示（世代なし）のときは付けない。

/** 世代 label として URL に載せてよい値（G1…、英数字とハイフン） */
export const isGenLabel = (v: string | null | undefined): v is string => !!v && /^[A-Za-z0-9-]{1,16}$/.test(v);

export function estimateLinks(estimateId: string, genLabel: string | null | undefined) {
  const base = `/estimate/${encodeURIComponent(estimateId)}`;
  const q = isGenLabel(genLabel) ? `?gen=${encodeURIComponent(genLabel)}` : '';
  return { conditions: `${base}${q}`, risk: `${base}/risk${q}`, report: `${base}/report${q}` };
}
