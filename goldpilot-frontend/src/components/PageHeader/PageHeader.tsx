import type { ReactNode } from 'react';
import { Space, Typography } from 'antd';

const { Text, Title } = Typography;

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, meta, actions }: PageHeaderProps) {
  return (
    <div className="workspace-header">
      <div className="workspace-header-main">
        {eyebrow && <Text className="workspace-eyebrow">{eyebrow}</Text>}
        <Title level={3} className="workspace-title">{title}</Title>
        {description && <Text className="workspace-description">{description}</Text>}
      </div>
      {(meta || actions) && (
        <Space className="workspace-header-side" size={12} wrap>
          {meta}
          {actions}
        </Space>
      )}
    </div>
  );
}
