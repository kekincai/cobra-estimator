// 解説 8 節の本文（文言は design/Guide.dc.html から）
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CURRENT_ESTIMATE_ID } from '../../ui/Layout';
import { FormulaPlayground, TrianglePlayground } from './Interactive';
import type { GuideSectionId } from './sections';

const card = 'flex flex-col rounded-[14px] border border-line bg-bg px-[18px] py-4';
const smallCard = 'flex flex-col gap-1.5 rounded-xl border border-line bg-bg px-4 py-3.5';
const note = 'text-[12px] leading-[1.6] text-sub';

function GoLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`guide-lk inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-muted px-3.5 text-[13px] font-bold text-text no-underline ${className ?? ''}`}>
      {children} <span className="text-accent">↗</span>
    </Link>
  );
}

const About = () => (
  <>
    <p>
      CoBRA (Cost estimation, Benchmarking, and Risk Assessment) は、少ない実績データと専門家の知見を組み合わせて工数を見積もる手法です。過去の実績から「普通の生産性」を求め、そこにプロジェクトごとの事情 (変動要因) による上乗せを加えます。上乗せの大きさは専門家が幅をもって答え、シミュレーションで工数の分布にします。
    </p>
    <div className="mt-2 grid gap-3 md:grid-cols-3">
      {[
        ['実績データ', '10 件程度でよい', '統計的な回帰には足りない件数でも、名目生産性 α を求めるには十分です。'],
        ['専門家の知見', '幅で答える', '「この要因が最悪なら工数は何 % 増えるか」を最良・最頻・最悪の 3 点で。'],
        ['シミュレーション', '点ではなく分布', '10,000 回試行して「45 人月を超える確率は 34%」のように読めるようにします。'],
      ].map(([k, t, d]) => (
        <div key={k} className={`${card} gap-1.5`}>
          <span className="n text-[12px] text-accent">{k}</span>
          <span className="text-[14px] font-bold">{t}</span>
          <span className={note}>{d}</span>
        </div>
      ))}
    </div>
    <p className="mt-2">
      結果として得られるのは一つの数字ではなく、「推定値 (超過確率 50%)」と「その周りの幅」です。予算に対する超過確率や、どの要因を下げれば効くかまで同じモデルから読み取れるのが、他の見積り手法との違いです。
    </p>
  </>
);

const Formula = () => (
  <>
    <FormulaPlayground />
    <p>
      CO (Cost Overhead) は「その要因が原因で、名目工数に対して何 % 余計にかかるか」です。要因は独立に足し合わせるのが CoBRA の約束で、掛け算にはしません。間接要因だけは例外で、自分の CO を持たず、対象の直接要因の CO を倍率で強めます。
    </p>
  </>
);

const Factors = () => (
  <>
    <p>
      変動要因は「このプロジェクトは普通より手がかかるか」を決める観点です。各要因は 4 段階のレベル (L0 = 影響なし 〜 L3 = 最も悪い) で評価し、L3 のときの CO を専門家が三角分布で答えます。L1、L2 の CO は L3 の 1/3、2/3 として内挿します。
    </p>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <TrianglePlayground />
      <div className="flex flex-col gap-2.5">
        <div className={smallCard}>
          <h3>直接要因</h3>
          <span className={note}>自分の CO を持ち、工数に直接上乗せする。例: 要件の安定性、外部連携数。</span>
        </div>
        <div className={`${smallCard} border-dashed border-line-strong`}>
          <h3>間接要因</h3>
          <span className={note}>直接要因 1 つを「強める」。一段階まで、直接要因 1 つにつき 1 つまで。例: 顧客の関与度 → 要件の安定性。</span>
        </div>
        <div className={smallCard}>
          <h3>複数の専門家</h3>
          <span className={note}>三角分布は担当者ごとに持てます (S.T. / Y.T.)。モデル構築ではどれを使うか、平均を使うかを選びます。</span>
        </div>
        <GoLink to="/model/factors" className="justify-center">
          変動要因の画面へ
        </GoLink>
      </div>
    </div>
  </>
);

const Build = () => (
  <>
    <p>
      構築とは、採用した実績データから α を決めることです。各実績について「工数 ÷ (規模 × (1 + ΣCO))」を計算すると、その案件での名目生産性が出ます。それらの平均が α です。実績の ΣCO は、その案件のレベル値から計算します。
      このツールでは α を平均で求め、95% 信頼区間はブートストラップ (実績を重複ありで選び直して平均を取る操作を繰り返し、その 2.5% 点と 97.5% 点) で示します。
    </p>
    <div className="grid gap-3 md:grid-cols-2">
      <div className={`${card} gap-2`}>
        <h3>MMRE — 平均相対誤差</h3>
        <span className="n text-[13px] text-body">MMRE = 平均 ( |実績 − 推定| / 実績 )</span>
        <span className={note}>小さいほど良い。20% 以下なら実務で使える目安、18.4% (v3) は良好。</span>
      </div>
      <div className={`${card} gap-2`}>
        <h3>PRED(25) — 25% 以内に入った割合</h3>
        <span className="n text-[13px] text-body">PRED(25) = 誤差 25% 以内の件数 / 全件数</span>
        <span className={note}>大きいほど良い。75% なら 11 件中 8 件が帯の内側。</span>
      </div>
      <div className={`${card} gap-2`}>
        <h3>1 件抜き交差検証</h3>
        <span className={note}>
          1 件を隠して残りで α を求め、隠した 1 件を見積もる。これを全件で繰り返した誤差が上の MMRE / PRED。手持ちのデータで「初めて見る案件」への当たり具合を測る方法です。
        </span>
      </div>
      <div className={`${card} gap-2 border-coral-line bg-coral-bg-2`}>
        <h3 className="text-coral-soft">ΣCO と生産性の不整合</h3>
        <span className="text-[12px] leading-[1.6] text-body">
          レベル値が高い (ΣCO が大きい) のに生産性が良い、またはその逆の案件は、レベルの付け方か工数の集計に問題がある可能性があります。PJ-007 がその例で、除外して構築しています。
        </span>
      </div>
    </div>
    <p>
      精度が足りないときは、要因の定義 (レベルの切り方) や実績データ (除外・グループ分け) に戻って作り直します。この往復が CoBRA のモデル作りの中心で、ツールはそのたびに版 (v1, v2, v3 …) を残します。
    </p>
  </>
);

const Estimate = () => (
  <>
    <p>
      新しい案件の規模とレベル値を入れると、ツールは 10,000 回、各要因の三角分布から CO を引いて工数を計算します。その 10,000 個の工数を並べたものが「工数の分布」で、真ん中 (中央値) が推定値です。推定値は「50% の確率でこれを超える」工数であって、安全側の数字ではないことに注意してください。
    </p>
    <ol className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ['条件を入れる', '規模、8 要因のレベル、前提メモ'],
        ['実行する', '推定値・P20〜P95・要因ごとの上乗せ'],
        ['世代として残す', '条件と結果の組を G1〜G5 まで横に並べる'],
        ['比べて選ぶ', '案 A / 案 B の差を要因ごとに説明できる'],
      ].map(([t, d], i) => (
        <li key={t} className="flex flex-col gap-1 rounded-xl border border-line bg-bg px-4 py-3.5">
          <span className="n text-[12px] text-accent">{i + 1}</span>
          <span className="text-[13px] font-bold">{t}</span>
          <span className="text-[11.5px] leading-[1.5] text-sub">{d}</span>
        </li>
      ))}
    </ol>
    <p>
      世代は「同じ案件の条件違い」を並べるためのものです。要件が固まったら新しい世代を作り直し、レポートにはどの世代を載せるかを選びます。乱数のシードを固定しておくと、同じ条件なら同じ結果になり、レビューで再現できます。
    </p>
    <GoLink to={`/estimate/${CURRENT_ESTIMATE_ID}`} className="self-start">
      工数見積りの画面へ
    </GoLink>
  </>
);

const Risk = () => (
  <>
    <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <svg width="100%" height="200" viewBox="0 0 520 200" role="img" aria-label="工数超過確率の曲線。工数が増えるほど超える確率が下がる">
        <line x1="40" y1="170" x2="500" y2="170" stroke="var(--color-line)" />
        <line x1="40" y1="20" x2="40" y2="170" stroke="var(--color-line)" />
        <g fontFamily="Space Grotesk" fontSize="10" fill="var(--color-weak)">
          <text x="34" y="24" textAnchor="end">100%</text>
          <text x="34" y="98" textAnchor="end">50%</text>
          <text x="34" y="174" textAnchor="end">0%</text>
          <text x="40" y="188">30</text>
          <text x="270" y="188" textAnchor="middle">42.3</text>
          <text x="500" y="188" textAnchor="end">60 人月</text>
        </g>
        <path d="M 40 22 C 150 24, 220 60, 270 95 S 400 160, 500 168" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
        <line x1="270" y1="95" x2="270" y2="170" stroke="var(--color-line-strong)" strokeDasharray="3 3" />
        <circle cx="270" cy="95" r="5" fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth="2" />
        <text x="278" y="90" fontFamily="Noto Sans JP" fontSize="10" fill="var(--color-text)">
          推定値 = 超過 50%
        </text>
        <line x1="312" y1="118" x2="312" y2="170" stroke="var(--color-coral)" strokeDasharray="3 3" />
        <circle cx="312" cy="118" r="5" fill="var(--color-coral)" stroke="var(--color-bg)" strokeWidth="2" />
        <text x="320" y="122" fontFamily="Noto Sans JP" fontSize="10" fill="var(--color-coral-soft)">
          予算 45 → 超過 34%
        </text>
      </svg>
      <div className="flex flex-col gap-2.5">
        {[
          ['工数 → 確率', '「予算 45 人月で足りる確率は?」— 曲線を縦に読む。'],
          ['確率 → 工数', '「80% の確度で収めるにはいくら?」— 曲線を横に読む。'],
          ['寄与度', '上乗せのうち何割がどの要因か。レベルを 1 段下げたときの効き目もここから。'],
        ].map(([t, d]) => (
          <div key={t} className="flex flex-col gap-1 rounded-xl border border-line bg-bg px-3.5 py-3">
            <h3>{t}</h3>
            <span className={note}>{d}</span>
          </div>
        ))}
      </div>
    </div>
    <p>横軸は「工数」と「中央値を 100% とした比率」で切り替えられます。比率表示は、規模の違う案件どうしで幅の広さを比べるときに便利です。</p>
  </>
);

const E = CURRENT_ESTIMATE_ID;
const STEPS = [
  ['01', '変動要因を定義する', 'カテゴリ・名称・L0〜L3 の定義・直接/間接・三角分布。一から、または標準要因から。', 'モデル管理者', '/model/factors'],
  ['02', '実績データを入れる', '規模・工数・レベル値。CSV の一括取り込みも。特殊な案件は除外、近いものはグループに。', 'PMO', '/model/projects'],
  ['03', 'モデルを構築する', 'α を推定し、交差検証で MMRE / PRED を確認。不整合があれば 01・02 に戻る。', 'モデル管理者', '/model/build'],
  ['04', '工数を見積もる', '規模とレベル値を入れて実行。条件違いは世代として並べる。', '見積り担当', `/estimate/${E}`],
  ['05', 'リスクを見る', '予算に対する超過確率、要因の寄与度、効く打ち手。', '見積り担当 / PM', `/estimate/${E}/risk`],
  ['06', '報告する', 'A4 レポート / PDF。モデル情報と前提を同梱。JSON の書き出しもここから。', 'PMO', `/estimate/${E}/report`],
] as const;

const Usage = () => (
  <>
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {STEPS.map(([no, t, d, who, href]) => (
        <li key={no}>
          <Link to={href} className="guide-lk grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[14px] border border-line bg-bg px-4 py-3.5 text-text no-underline">
            <span className="n text-[14px] text-accent">{no}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-bold">{t}</span>
              <span className="text-[12px] leading-[1.5] text-sub">{d}</span>
            </span>
            <span className="text-[11px] whitespace-nowrap text-weak">
              {who} <span className="text-accent">↗</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
    <p>モデル管理者が 01〜03 を整え、見積り担当が 04〜06 を回す分担が基本です。精度が足りないときや要因が増えたときだけ 01〜03 に戻ります。</p>
  </>
);

const TERMS = [
  ['α (名目生産性)', '変動要因の影響がないときの、規模 1 単位あたりの工数。人月 / FP。'],
  ['CO (Cost Overhead)', '要因 1 つが名目工数に上乗せする割合。L3 の値を専門家が三角分布で与える。'],
  ['ΣCO', '全要因の CO の合計。1 + ΣCO が名目工数に掛かる。'],
  ['レベル値 L0〜L3', '要因の悪さの 4 段階。L0 で CO = 0、L3 で専門家の与えた CO。'],
  ['直接要因 / 間接要因', '直接は工数に上乗せ。間接は直接要因 1 つを強めるだけで自分の CO を持たない。'],
  ['三角分布', '最良・最頻・最悪の 3 点で決まる分布。専門家の「幅のある答え」を表す。'],
  ['モンテカルロ・シミュレーション', '分布から値を何度も引いて結果の分布を作る方法。既定 10,000 回。'],
  ['推定値 (P50)', '分布の中央値。超過確率 50%。安全側の数字ではない。'],
  ['超過確率', 'ある工数を実績が上回る確率。予算の妥当性を測る。'],
  ['MMRE / PRED(25)', 'モデル精度。平均相対誤差と、誤差 25% 以内に入った割合。'],
  ['交差検証 (1 件抜き)', '1 件ずつ隠して見積もり、当たり具合を測る精度評価。'],
  ['世代', '同じ案件の見積り条件と結果の組。最大 5 つ並べて比較する。'],
  ['グループ', '性質の近い実績のまとまり。モデルはグループ単位で構築できる。'],
  ['モデルパラメータ (JSON)', '要因・三角分布・関係・精度・(実績) をまとめた持ち運び用ファイル。旧 XML の後継。'],
] as const;

const Glossary = () => (
  <dl className="m-0 grid gap-x-8 gap-y-4 md:grid-cols-2">
    {TERMS.map(([t, d]) => (
      <div key={t}>
        <dt>{t}</dt>
        <dd>{d}</dd>
      </div>
    ))}
  </dl>
);

/** 節ごとの見出し（h2）。kicker / title は sections.ts と同じ */
export const SECTION_HEADINGS: Record<GuideSectionId, string> = {
  about: 'CoBRA 法とは',
  formula: '工数算定式 — 動かして確かめる',
  factors: '変動要因と三角分布',
  build: 'モデル構築と精度の読み方',
  estimate: '見積りの実行と世代',
  risk: 'リスクアセスメント — 超過確率の読み方',
  usage: 'このツールの使い方 — 6 つの画面',
  glossary: '用語集',
};

export const SECTION_BODIES: Record<GuideSectionId, () => ReactNode> = {
  about: About,
  formula: Formula,
  factors: Factors,
  build: Build,
  estimate: Estimate,
  risk: Risk,
  usage: Usage,
  glossary: Glossary,
};
