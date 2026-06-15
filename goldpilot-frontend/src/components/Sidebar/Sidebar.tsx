import { Menu, Button } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChartOutlined,
  BulbOutlined,
  LoginOutlined,
  LogoutOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { authService } from '@/services/auth';

const VERSION = 'v1.1.0';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = authService.getUser();
  const isAuthenticated = authService.isAuthenticated();

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    if (location.pathname === '/ai-account') return ['ai-account'];
    if (location.pathname === '/research-center') return ['research-center'];
    return ['home'];
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'home',
      icon: <BulbOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">AI智能分析</span>,
      onClick: () => navigate('/'),
    },
    {
      key: 'research-center',
      icon: <BarChartOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">量化策略实验室</span>,
      onClick: () => navigate('/research-center'),
    },
    {
      key: 'ai-account',
      icon: <RobotOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">AI交易员</span>,
      onClick: () => navigate('/ai-account'),
    },
  ];

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-lockup">
          <div className="sidebar-logo">
            <ThunderboltOutlined className="text-lg" />
          </div>
          <div>
            <h1 className="sidebar-title">GoldPilot</h1>
            <p className="sidebar-subtitle">AI Trade Console</p>
          </div>
        </div>
      </div>

      <div className="sidebar-menu">
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={getSelectedKey()}
          items={menuItems}
          className="bg-transparent border-0"
        />
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-support">
          <strong>XAUUSD Focus</strong>
          <span>AI 分析 · 策略库 · 智能资金分配</span>
        </div>
        <div className="sidebar-status">
          {isAuthenticated && user ? (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="sidebar-status-dot"></div>
                <span>{user.role === 'admin' ? '管理员' : '测试员'} {user.accountId}</span>
              </div>
              <Button
                type="text"
                size="small"
                icon={<LogoutOutlined />}
                style={{ color: '#64748b', padding: '0 4px' }}
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
