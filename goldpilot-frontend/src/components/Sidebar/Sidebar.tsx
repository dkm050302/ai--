import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeOutlined, LineChartOutlined, RobotOutlined, SettingOutlined, DatabaseOutlined, ExperimentOutlined } from '@ant-design/icons';

const VERSION = 'v1.1.0';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    if (location.pathname === '/ai-account') {
      return ['ai-account'];
    }
    if (location.pathname === '/datasource-settings') {
      return ['datasource-settings'];
    }
    if (location.pathname === '/research-center') {
      return ['research-center'];
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
      key: 'research-center',
      icon: <ExperimentOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">量化策略</span>,
      onClick: () => navigate('/research-center'),
    },
    {
      key: 'ai-account',
      icon: <RobotOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">AI账号</span>,
      onClick: () => navigate('/ai-account'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'datasource-settings',
      icon: <DatabaseOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">数据源设置</span>,
      onClick: () => navigate('/datasource-settings'),
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
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="flex items-center gap-3">
          <div className="sidebar-logo">
            <LineChartOutlined className="text-xl text-white" />
          </div>
          <div>
            <h1 className="sidebar-title">GoldPilot</h1>
            <p className="sidebar-subtitle">黄金交易决策系统</p>
          </div>
        </div>
      </div>

      <div className="sidebar-menu">
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKey()}
          items={menuItems}
          className="bg-transparent border-0 text-white"
        />
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <div className="flex items-center gap-2 text-xs">
            <div className="sidebar-status-dot"></div>
            <span>单人样品运行中</span>
          </div>
          <p>{VERSION}</p>
        </div>
      </div>
    </aside>
  );
}
