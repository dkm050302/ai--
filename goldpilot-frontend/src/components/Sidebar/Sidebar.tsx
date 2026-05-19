import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeOutlined, LineChartOutlined, SettingOutlined } from '@ant-design/icons';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    if (location.pathname === '/mt4-account') {
      return ['mt4-account'];
    }
    return ['home'];
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'home',
      icon: <HomeOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">首页</span>,
      onClick: () => navigate('/'),
    },
    {
      key: 'mt4-account',
      icon: <LineChartOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">MT4账号管理</span>,
      onClick: () => navigate('/mt4-account'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'settings',
      icon: <SettingOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">系统设置</span>,
      onClick: () => navigate('/settings'),
      disabled: true,
    },
  ];

  return (
    <div className="w-64 h-screen bg-[#0f172a] text-white flex flex-col shadow-2xl">
      {/* Logo区域 */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <LineChartOutlined className="text-xl text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">GoldPilot</h1>
            <p className="text-xs text-white/80 mt-0.5">黄金交易决策系统</p>
          </div>
        </div>
      </div>

      {/* 导航菜单 */}
      <div className="flex-1 py-4 px-3 overflow-y-auto">
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKey()}
          items={menuItems}
          className="bg-transparent border-0"
          style={{
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.85)',
          }}
        />
      </div>

      {/* 底部信息 */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="bg-slate-800/50 rounded-lg p-3 backdrop-blur-sm border border-slate-700/30">
          <div className="flex items-center gap-2 text-xs text-white/80 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span>系统运行正常</span>
          </div>
          <p className="text-xs text-blue-400 font-medium">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
