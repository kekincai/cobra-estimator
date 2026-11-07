// ルート一覧（IMPLEMENTATION_BRIEF.md §5）。各画面は pages/*.tsx を差し替える。
import { createBrowserRouter } from 'react-router';
import Build from './pages/Build';
import Estimate from './pages/Estimate';
import FactorNew from './pages/FactorNew';
import Factors from './pages/Factors';
import Flow from './pages/Flow';
import Guide from './pages/Guide';
import Main from './pages/Main';
import ProjectData from './pages/ProjectData';
import ProjectEdit from './pages/ProjectEdit';
import Relations from './pages/Relations';
import Report from './pages/Report';
import Risk from './pages/Risk';
import Transfer from './pages/Transfer';
import { Layout } from './ui/Layout';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Main /> },
      { path: '/model/factors', element: <Factors /> },
      { path: '/model/factors/new', element: <FactorNew /> },
      { path: '/model/relations', element: <Relations /> },
      { path: '/model/projects', element: <ProjectData /> },
      { path: '/model/projects/new', element: <ProjectEdit /> },
      { path: '/model/projects/:id', element: <ProjectEdit /> },
      { path: '/model/build', element: <Build /> },
      { path: '/transfer', element: <Transfer /> },
      { path: '/estimate/:id', element: <Estimate /> },
      { path: '/estimate/:id/risk', element: <Risk /> },
      { path: '/guide', element: <Guide /> },
      { path: '/guide/flow', element: <Flow /> },
    ],
  },
  // レポートは白地 A4・ナビなし（印刷用）
  { path: '/estimate/:id/report', element: <Report /> },
]);
