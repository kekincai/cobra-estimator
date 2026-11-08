// 管理者へのアップロード（申請）の中身を、レビュー画面で読める要約にする。
// payload は利用者が送った estima-model/1（実績はサーバーで除いてある）。壊れていても落ちないように読む。

export interface SubmissionSummary {
  modelName: string;
  version: number | null;
  factors: number;
  standard: number;
  custom: number;
  triangles: number;
  experts: string[];
  relations: number;
  mmre: number | null;
  pred25: number | null;
  /** 要因名（番号順、最大 maxNames 件） */
  factorNames: string[];
  /** 形式が estima-model/1 でない */
  unknownFormat: boolean;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function summarizeSubmission(payload: unknown, maxNames = 20): SubmissionSummary {
  const p = obj(payload);
  const model = obj(p.model);
  const factors = arr(p.factors).map(obj);
  const triangles = arr(p.triangles).map(obj);
  const acc = obj(p.accuracy);
  const indirectWithTarget = factors.filter((f) => f.kind === 'indirect' && f.targetNo != null).length;
  return {
    modelName: typeof model.name === 'string' ? model.name : '',
    version: num(model.version),
    factors: factors.length,
    standard: factors.filter((f) => f.origin === 'standard').length,
    custom: factors.filter((f) => f.origin !== 'standard').length,
    triangles: triangles.length,
    experts: [...new Set(triangles.map((t) => t.expert).filter((e): e is string => typeof e === 'string'))],
    relations: Math.max(arr(p.relations).length, indirectWithTarget),
    mmre: num(acc.mmre),
    pred25: num(acc.pred25),
    factorNames: [...factors]
      .sort((a, b) => (num(a.no) ?? 0) - (num(b.no) ?? 0))
      .slice(0, maxNames)
      .map((f) => `${num(f.no) != null ? `${String(f.no).padStart(2, '0')} ` : ''}${typeof f.name === 'string' ? f.name : '(名前なし)'}`),
    unknownFormat: p.format !== 'estima-model/1',
  };
}
