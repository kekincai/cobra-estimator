/**
 * シミュレーション設定（design/SimSettings.dc.html）— Build と Estimate で共用する公開 API。
 * このファイルの export は他画面が import するので、シグネチャを変えないこと（追加は可）。
 *
 * 使い方:
 *   import { SimSettingsDialog, useSimSettings } from '../features/sim-settings';
 *
 *   const sim = useSimSettings('estimate');      // 'build' | 'estimate'
 *   const [open, setOpen] = useState(false);
 *   <button onClick={() => setOpen(true)}>設定</button>
 *   <SimSettingsDialog open={open} onClose={() => setOpen(false)} target="estimate" />
 *
 *   // 実行時
 *   const seed = sim.seedForRun();               // 固定なら sim.seed、「実行ごとに更新」なら毎回新しい値
 *   await runSimulation(model, input, { runs: sim.runs, seed });
 *
 * useSimSettings(target) が返すもの:
 *   runs: number            試行回数（1,000 / 10,000 / 100,000。既定 10,000 = DEFAULT_RUNS）
 *   seed: number            シード（既定 DEFAULT_SEED）
 *   fixedSeed: boolean      true = 固定（既定）、false = 実行ごとに更新
 *   setRuns / setSeed / setFixedSeed / update(patch)   値を保存（同じ target の全フックに即反映）
 *   seedForRun(): number    実行に使うシード
 *   runsLabel: string       "10,000"
 *   seedLabel: string       "固定 (再現可能)" | "実行ごとに更新"
 *
 * 保存先は localStorage（キー `estima.sim.build` / `estima.sim.estimate`）。読み書きは try/catch 済みで、
 * 使えない環境ではタブ内メモリだけで動く。ダイアログの「適用先 = 両方」は両方のキーに保存する。
 */
export { SimSettingsDialog, type SimSettingsDialogProps } from './SimSettingsDialog';
export { useSimSettings, type UseSimSettings } from './useSimSettings';
export { DEFAULTS as SIM_DEFAULTS, RUN_CHOICES, type SimSettingsValue, type SimTarget } from './store';
