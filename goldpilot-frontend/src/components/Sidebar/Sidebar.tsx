import { Menu, Button } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ApiOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  BulbOutlined,
  CodeOutlined,
  CreditCardOutlined,
  DatabaseOutlined,
  FundProjectionScreenOutlined,
  GlobalOutlined,
  LoginOutlined,
  LogoutOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
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

  const menuItems: MenuProps['items'] = [
    {
      key: 'home',
      icon: <BulbOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">AI智能分析</span>,
      onClick: () => navigate('/'),
    },
    {
      key: 'datasource-settings',
      icon: <DatabaseOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">数据中心</span>,
      onClick: () => navigate('/datasource-settings'),
    },
    {
      key: 'marketplace',
      icon: <ShopOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">策略市场</span>,
      disabled: true,
    },
    {
      key: 'indicator-ide',
      icon: <CodeOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">指标 IDE</span>,
      disabled: true,
    },
    {
      key: 'research-center',
      icon: <BarChartOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">指标策略</span>,
      onClick: () => navigate('/research-center'),
    },
    {
      key: 'script-strategy',
      icon: <ApartmentOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">脚本策略</span>,
      disabled: true,
    },
    {
      key: 'ai-account',
      icon: <RobotOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">交易机器人</span>,
      onClick: () => navigate('/ai-account'),
    },
    {
      key: 'manual-sim',
      icon: <FundProjectionScreenOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">券商账户</span>,
      onClick: () => navigate('/manual-sim'),
    },
    {
      key: 'billing',
      icon: <CreditCardOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">会员充值</span>,
      disabled: true,
    },
    {
      key: 'profile',
      icon: <UserOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">个人中心</span>,
      disabled: true,
    },
    ...(isAdmin ? [{
      key: 'admin',
      icon: <TeamOutlined className="text-lg" />,
      label: <span className="ml-2 font-medium">测试管理</span>,
      onClick: () => navigate('/admin'),
    }] : []),
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
          <strong>联系我们</strong>
          <span>Support&nbsp;&nbsp;|&nbsp;&nbsp;Feature request</span>
          <strong>获取支持</strong>
          <span>Email&nbsp;&nbsp;|&nbsp;&nbsp;24/7 live chat</span>
          <div className="sidebar-socials" aria-label="社交账户">
            <SafetyCertificateOutlined />
            <ApiOutlined />
            <GlobalOutlined />
          </div>
        </div>
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
