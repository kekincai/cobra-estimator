// 業務フロー 6 段階（design/Flow.dc.html）
// 設計稿の見本の値（専門家 S.T. / Y.T.、グループ A / B、採用した実績 11 件、v1 → v3）は文中に書き込まず、
// flowStagesFor() で現在のモデル（facts.ts の flowFacts）から差し込む。読み込み中は数値なしの文言にする。
import { DEFAULT_RUNS } from 'cobra-core';
import { CURRENT_ESTIMATE_ID as E } from '../../ui/Layout';
import type { FlowFacts } from './facts';

export interface FlowStage {
  no: string;
  t: string;
  sub: string;
  who: string;
  desc: string;
  screens: [label: string, href: string][];
  inp: string[];
  out: string[];
  old: string[];
  tip: string;
  diff: string;
}

export const FLOW_STAGES: FlowStage[] = [
  {
    no: '01', t: '変動要因を定義', sub: 'カテゴリ・L0〜L3・直接/間接・三角分布', who: 'モデル管理者',
    desc: '工数を押し上げる要因を決め、各レベルの意味を言葉で定義します。専門家ごとに最良・最頻・最悪の 3 点で工数増加率を見積もり、間接要因はどの直接要因を強めるかを 1 つだけ指定します。',
    screens: [['変動要因', '/model/factors'], ['要因を追加', '/model/factors/new'], ['標準要因 JSON を取り込む', '/transfer']],
    inp: ['標準要因 JSON', '専門家の判断'], out: ['要因定義 L0〜L3', '三角分布 (最良 / 最頻 / 最悪)', '間接 → 直接の関係'], old: ['J-MDL-001', 'J-MDL-002', 'J-MDL-007'],
    tip: '一から定義するのが既定の流れ。標準要因は「参考に取り込む」位置づけで、取り込んだ後も同じ画面で編集できます。',
    diff: '要因ごとの三角形がその場で描かれ、数字を直すと即座に形が変わる。XML の手編集はなくなった。',
  },
  {
    no: '02', t: '実績データを入れる', sub: '規模・工数・レベル値。採用 / 除外とグループ', who: 'PMO',
    desc: '過去プロジェクトの規模 (FP) と工数 (人月)、各要因のレベル値を登録します。特殊な案件は除外し、性質の近いものをグループにまとめてモデルに使います。',
    screens: [['実績データ', '/model/projects'], ['CSV で取り込む', '/transfer?tab=csv']],
    inp: ['CSV (規模・工数・レベル値)', '手入力'], out: ['採用 / 除外の判定', 'グループ', '名目線 (α) のプレビュー'], old: ['J-MDL-005', 'EF002'],
    tip: '採用を切り替えると散布図の名目線がその場で動くので、外れ値の影響を見ながら決められます。',
    diff: 'CSV の列対応を画面で確認してから登録。1 件ごとの追加・修正もシートを探さずに済む。',
  },
  {
    no: '03', t: 'モデルを構築', sub: 'α を推定 → 交差検証 → 不整合チェック', who: 'モデル管理者',
    desc: '採用した実績から名目生産性 α を推定し、1 件抜きの交差検証で精度 (MMRE / PRED) を確認します。ΣCO と実績の生産性が食い違う案件は不整合として指摘されます。',
    screens: [['モデル構築', '/model/build']],
    inp: ['要因定義', '採用した実績', '専門家 (各人 / 平均)'], out: ['α と 95% 信頼区間', 'MMRE / PRED(25)', '不整合の指摘', 'モデルの版'], old: ['J-MDL-003', 'J-MDL-004', 'J-MDL-006'],
    tip: '精度が足りなければ要因や実績に戻る。この往復が旧版の「J-MDL-003 / 004 の繰り返し」に当たります。',
    // 設計稿は「計算はサーバ側」。実装はブラウザ内 Web Worker（IMPLEMENTATION_BRIEF.md §7）
    diff: '計算はブラウザ内 (Web Worker)。三段の進捗が見え、版を残して α と精度の推移を追える。',
  },
  {
    no: '04', t: '工数を見積もる', sub: '規模とレベル値を入力 → 分布と推定値', who: '見積り担当',
    desc: `新しい案件の規模と各要因のレベル値を入れると、${DEFAULT_RUNS.toLocaleString('en-US')} 回 (既定) のシミュレーションから工数の分布と推定値 (中央値) が得られます。条件を変えた案は世代として並べて比較します。`,
    screens: [['工数見積り', `/estimate/${E}`]],
    inp: ['規模 (FP)', 'レベル値 L0〜L3', '採用するモデル'], out: ['推定工数 (中央値)', '超過確率 80%〜5% の幅 (P20〜P95)', '要因ごとの上乗せ', '世代 G1〜G5'], old: ['J-EST-001', 'J-EST-002', 'J-EST-003'],
    tip: 'レベルを 1 つ変えるたびに推定値と帯が動くので、何が効いているかを会話しながら詰められます。',
    diff: '世代は最大 5 つ。旧版の「世代」の考え方はそのまま、比較は同じ画面に並ぶ。',
  },
  {
    no: '05', t: 'リスクを見る', sub: '超過確率 ⇄ 工数、要因の寄与度', who: '見積り担当 / PM',
    desc: '予算に対する超過確率、逆に確率から必要な工数を読み取ります。どの要因が上乗せの何割を占めるかと、レベルを 1 段下げたときの効き目を確認します。',
    screens: [['リスクアセスメント', `/estimate/${E}/risk`]],
    inp: ['予算 (人月)', '目標の超過確率'], out: ['超過確率 ⇄ 工数', '要因の寄与度 (% / 人月)', '効く打ち手 上位 3'], old: ['J-RSK-001', 'J-RSK-002', 'J-RSK-003', 'J-RSK-004'],
    tip: '予算スライダーを動かすと曲線上の点と「予算内」の領域が追従します。',
    diff: '寄与度は番号順 / 寄与度順、% / 人月を切り替え。打ち手の提案は Web 版で追加。',
  },
  {
    no: '06', t: '報告する', sub: 'A4 レポート / PDF、モデルの JSON 書き出し', who: 'PMO',
    desc: '採用した世代の結果とモデル情報を 1 枚のレポートにまとめます。実績データは含めず、標準データへのフィードバック用に JSON を書き出せます。',
    screens: [['見積りレポート', `/estimate/${E}/report`], ['JSON を書き出す', '/transfer?tab=export']],
    inp: ['採用した世代', 'モデル情報', '前提と注意事項'], out: ['A4 レポート / PDF', 'モデルパラメータ JSON'], old: ['J-REP-001', 'EF001'],
    tip: 'レポートには見込み幅 (超過確率 95%〜5%・P5〜P95)、根拠付きの要因表、打ち手の候補まで載るので、そのまま承認に回せます。',
    diff: 'メールで XML を送る運用は、JSON のアップロードと承認フローに置き換え。',
  },
];

/** フローの戻りループ（from の段から to の段へ） */
export const FLOW_LOOPS = [
  { from: 2, to: 0, label: '精度が足りない → 要因・実績を見直して再構築' },
  { from: 4, to: 3, label: '条件を変えて再見積り (世代 G1〜G5)' },
] as const;

export const AUTOPLAY_MS = 1800;

/** 版の範囲の表記。例 "v1 → v3"、1 版だけなら "v3"、版がなければ null */
export function versionSpan(f: FlowFacts | null, sep = ' → '): string | null {
  const v = f?.versions;
  if (!v) return null;
  return v.first === v.last ? `v${v.last}` : `v${v.first}${sep}v${v.last}`;
}

/**
 * 現在のモデルの事実を差し込んだ 6 段階。f が null（読み込み中・失敗）なら数値なしの文言のまま（FLOW_STAGES）。
 * 差し込むのは: 専門家名（01・03）、グループ（02）、採用した実績の件数（03、使用中の版の n）、版の範囲（03）。
 */
export function flowStagesFor(f: FlowFacts | null): FlowStage[] {
  if (!f) return FLOW_STAGES;
  const ex = f.experts.join(' / ');
  const span = versionSpan(f);
  const spanRange = versionSpan(f, '〜');
  return FLOW_STAGES.map((s) => {
    switch (s.no) {
      case '01':
        return { ...s, inp: s.inp.map((c) => (c === '専門家の判断' && ex ? `専門家の判断 (${ex})` : c)) };
      case '02':
        return { ...s, out: s.out.map((c) => (c === 'グループ' && f.groups.length ? `グループ ${f.groups.join(' / ')}` : c)) };
      case '03':
        return {
          ...s,
          inp: s.inp.map((c) =>
            c === '採用した実績' && f.adoptedN !== null
              ? `採用した実績 ${f.adoptedN} 件`
              : c === '専門家 (各人 / 平均)' && ex
                ? `専門家 (${ex} / 平均)`
                : c,
          ),
          out: s.out.map((c) => (c === 'モデルの版' && span ? `モデル ${span}` : c)),
          diff: spanRange ? s.diff.replace('版を残して', `版 (${spanRange}) を残して`) : s.diff,
        };
      default:
        return s;
    }
  });
}
