import { Navigate, createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { Home } from '@/pages/Home/Home';
import { AIAccount } from '@/pages/AIAccount/AIAccount';
import { DataSourceSettingsPage } from '@/pages/DataSourceSettings';
import { ResearchCenter } from '@/pages/ResearchCenter';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'event-driven',
        element: <Navigate to="/" replace />,
      },
      {
        path: 'ai-account',
        element: <AIAccount />,
      },
      {
        path: 'datasource-settings',
        element: <DataSourceSettingsPage />,
      },
      {
        path: 'research-center',
        element: <ResearchCenter />,
      },
    ],
  },
]);
