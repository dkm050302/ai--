import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Tabs } from '@/components/Tabs/Tabs';

export function MainLayout() {
  return (
    <div className="flex h-screen bg-slate-100">
      {/* 侧边导航 - 深色背景 */}
      <div className="flex-shrink-0">
        <Sidebar />
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
        {/* 顶部Tab */}
        <Tabs />

        {/* 内容区 */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-[1800px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
