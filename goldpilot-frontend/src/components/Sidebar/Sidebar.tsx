import { Menu, Button } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeOutlined, LineChartOutlined, RobotOutlined, SettingOutlined, DatabaseOutlined, ExperimentOutlined, FundProjectionScreenOutlined, TeamOutlined, LogoutOutlined, LoginOutlined } from '@ant-design/icons';
import { authService } from '@/services/auth';

const VERSION = 'v1.1.0';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = authService.getUser();
  const isAuthenticated = authService.isAuthenticated();
  const isAdmin = user?.role === 'admin';

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    if (location.pathname === '/ai-account') return ['ai-account'];
    if (location.pathname === '/datasource-settings') return ['datasource-settings'];
    if (location.pathname === '/manual-sim') return ['manual-sim'];
    if (location.pathname === '/research-center') return ['research-center'];
    if (location.pathname === '/admin') return ['admin'];
    return ['home'];
  };

  // 未登录时只显示首页
  const menuItems: MenuProps['items'] = [
    {
      key: 'home',
      icon: <HomeOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">首页</span>,
      onClick: () => navigate('/'),
    },
    // 未登录时不显示以下菜单
    ...(isAuthenticated ? [
      {
        key: 'manual-sim',
        icon: <FundProjectionScreenOutlined className="text-lg" />,
        label: <span className="ml-2 font-medium">模拟账户</span>,
        onClick: () => navigate('/manual-sim'),
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
      ...(isAdmin ? [{
        key: 'admin',
        icon: <TeamOutlined className="text-lg" />,
        label: <span className="ml-2 font-medium">测试管理</span>,
        onClick: () => navigate('/admin'),
      }] : []),
      { type: 'divider' as const },
      {
        key: 'datasource-settings',
        icon: <DatabaseOutlined className="text-lg" />,
        label: <span className="ml-2 font-medium">数据源设置</span>,
        onClick: () => navigate('/datasource-settings'),
      },
    ] : []),
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
          {isAuthenticated && user ? (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="sidebar-status-dot"></div>
                <span>{isAdmin ? '管理员' : '测试员'} {user.accountId}</span>
              </div>
              <Button
                type="text"
                size="small"
                icon={<LogoutOutlined />}
                style={{ color: '#8b949e', padding: '0 4px' }}
                onClick={() => { authService.logout(); navigate('/login'); }}
              />
            </div>
          ) : (
            <Button
              type="primary"
              size="small"
              icon={<LoginOutlined />}
              block
              onClick={() => navigate('/login')}
              style={{ marginBottom: 8 }}
            >
              登录
            </Button>
          )}
          <p>{VERSION}</p>
        </div>
      </div>
    </aside>
  );
}
