import type { BuildOptions, BuildStage, EstimateInput, ModelSpec, ProjectRecord, SimOptions } from 'cobra-core';

type Opts<T> = Omit<T, 'onProgress'>;

export type WorkerRequest =
  | { id: number; type: 'simulate'; model: ModelSpec; input: EstimateInput; opts: Opts<SimOptions> }
  | { id: number; type: 'build'; model: ModelSpec; projects: ProjectRecord[]; opts: Opts<BuildOptions> }
  | { id: number; type: 'levers'; model: ModelSpec; input: EstimateInput; opts: Opts<SimOptions> & { budget?: number; top?: number } };

export type WorkerResponse =
  | { id: number; type: 'progress'; stage: BuildStage; done: number; total: number }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; message: string }
  /** どの依頼か特定できない失敗（依頼を受け取れなかった等）。待っている依頼をすべて失敗にする */
  | { id: null; type: 'fatal'; message: string };
