import { Avatar, Badge, Button, Tooltip } from 'antd';
import { useLocation } from 'react-router-dom';
import {
  BellOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  ReloadOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { authService } from '@/services/auth';

const TAB_LABELS: Record<string, string> = {
  '/': 'AI智能分析',
  '/ai-account': '交易机器人',
  '/manual-sim': '券商账户',
  '/datasource-settings': '数据中心',
  '/research-center': '指标策略',
  '/admin': '测试管理',
};

export function Tabs() {
  const location = useLocation();
  const user = authService.getUser();
  const pageLabel = TAB_LABELS[location.pathname] || '工作台';

  return (
    <div className="workspace-tabs" aria-label="顶部工具栏">
      <div className="topbar-left">
        <Tooltip title="折叠菜单">
          <Button type="text" icon={<MenuFoldOutlined />} className="topbar-icon-btn" />
        </Tooltip>
        <Tooltip title="刷新当前页面">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            className="topbar-icon-btn"
            onClick={() => window.location.reload()}
          />
        </Tooltip>
        <span className="topbar-page">{pageLabel}</span>
      </div>

      <div className="topbar-right">
        <Avatar size={32} icon={<UserOutlined />} className="topbar-avatar" />
        <span className="topbar-user">{user?.accountId || 'Test User'}</span>
        <Badge count={3} size="small">
          <Button type="text" icon={<BellOutlined />} className="topbar-icon-btn" />
        </Badge>
        <Tooltip title="语言与市场">
          <Button type="text" icon={<GlobalOutlined />} className="topbar-icon-btn" />
        </Tooltip>
        <Tooltip title="系统设置">
          <Button type="text" icon={<SettingOutlined />} className="topbar-icon-btn" />
        </Tooltip>
      </div>
    </div>
  );
}
