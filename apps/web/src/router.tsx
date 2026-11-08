// ルート一覧（IMPLEMENTATION_BRIEF.md §5）。各画面は pages/*.tsx を差し替える。
// 画面のコードは React.lazy で画面ごとの chunk に分ける（取り込み画面の zod などを全画面で読まない）。
// 画面切替は react-router が startTransition で行うので、読み込み中も前の画面と外枠を出したまま。
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { Layout } from './ui/Layout';
import { PageFallback, RouteShell, type RouteHandle } from './ui/RouteShell';

const Main = lazy(() => import('./pages/Main'));
const Factors = lazy(() => import('./pages/Factors'));
const FactorNew = lazy(() => import('./pages/FactorNew'));
const Relations = lazy(() => import('./pages/Relations'));
const ProjectData = lazy(() => import('./pages/ProjectData'));
const ProjectEdit = lazy(() => import('./pages/ProjectEdit'));
const Build = lazy(() => import('./pages/Build'));
const Transfer = lazy(() => import('./pages/Transfer'));
const Estimate = lazy(() => import('./pages/Estimate'));
const Risk = lazy(() => import('./pages/Risk'));
const Report = lazy(() => import('./pages/Report'));
const Guide = lazy(() => import('./pages/Guide'));
const Flow = lazy(() => import('./pages/Flow'));
const Users = lazy(() => import('./pages/Users'));

const h = (handle: RouteHandle) => handle;

export const router = createBrowserRouter([
  {
    // 画面タイトル・フォーカス移動・読み上げ（レポートも含む全画面）
    element: <RouteShell />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Main />, handle: h({ title: 'ダッシュボード', screen: 'dashboard' }) },
          { path: '/model/factors', element: <Factors />, handle: h({ title: '変動要因' }) },
          { path: '/model/factors/new', element: <FactorNew />, handle: h({ title: '要因を追加 — 変動要因' }) },
          { path: '/model/relations', element: <Relations />, handle: h({ title: '関係図 — 変動要因' }) },
          { path: '/model/projects', element: <ProjectData />, handle: h({ title: '実績データ' }) },
          { path: '/model/projects/new', element: <ProjectEdit />, handle: h({ title: 'プロジェクトを追加 — 実績データ' }) },
          { path: '/model/projects/:id', element: <ProjectEdit />, handle: h({ title: (p) => `${p.id ?? ''} — 実績データ` }) },
          { path: '/model/build', element: <Build />, handle: h({ title: 'モデル構築' }) },
          { path: '/transfer', element: <Transfer />, handle: h({ title: '取り込み / 書き出し' }) },
          { path: '/estimate/:id', element: <Estimate />, handle: h({ title: '工数見積り', estimate: true }) },
          { path: '/estimate/:id/risk', element: <Risk />, handle: h({ title: 'リスク', estimate: true }) },
          { path: '/guide', element: <Guide />, handle: h({ title: 'CoBRA法の解説' }) },
          { path: '/guide/flow', element: <Flow />, handle: h({ title: '業務フロー — CoBRA法の解説' }) },
          { path: '/admin/users', element: <Users />, handle: h({ title: '利用者' }) },
        ],
      },
      // レポートは白地 A4・ナビなし（印刷用）
      {
        path: '/estimate/:id/report',
        element: (
          <Suspense fallback={<PageFallback paper />}>
            <Report />
          </Suspense>
        ),
        handle: h({ title: 'レポート', estimate: true }),
      },
    ],
  },
]);
