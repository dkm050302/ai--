import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { Home } from '@/pages/Home/Home';
import { MT4Account } from '@/pages/MT4Account/MT4Account';
import { AIAccount } from '@/pages/AIAccount/AIAccount';
import { EventDrivenHome } from '@/pages/EventDrivenHome/EventDrivenHome';
import { DataSourceSettingsPage } from '@/pages/DataSourceSettings';

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
        element: <EventDrivenHome />,
      },
      {
        path: 'mt4-account',
        element: <MT4Account />,
      },
      {
        path: 'ai-account',
        element: <AIAccount />,
      },
      {
        path: 'datasource-settings',
        element: <DataSourceSettingsPage />,
      },
    ],
  },
]);
