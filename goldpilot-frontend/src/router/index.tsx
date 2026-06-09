import { Navigate, createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { Home } from '@/pages/Home/Home';
import { AIAccount } from '@/pages/AIAccount/AIAccount';
import { DataSourceSettingsPage } from '@/pages/DataSourceSettings';
import { ManualSimAccountPage } from '@/pages/ManualSimAccount';
import { ResearchCenter } from '@/pages/ResearchCenter';
import { LoginPage } from '@/pages/Login/LoginPage';
import { AdminPage } from '@/pages/Admin/AdminPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
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
        path: 'manual-sim',
        element: <ManualSimAccountPage />,
      },
      {
        path: 'datasource-settings',
        element: <DataSourceSettingsPage />,
      },
      {
        path: 'research-center',
        element: <ResearchCenter />,
      },
      {
        path: 'admin',
        element: <AdminPage />,
      },
    ],
  },
]);
