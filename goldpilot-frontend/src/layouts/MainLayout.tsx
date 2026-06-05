import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Tabs } from '@/components/Tabs/Tabs';

export function MainLayout() {
  return (
    <div className="app-shell">
      <div className="flex-shrink-0">
        <Sidebar />
      </div>

      <div className="app-main">
        <Tabs />

        <main className="app-content">
          <div className="app-content-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
