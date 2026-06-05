import { Tabs as AntTabs } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface TabItem {
  key: string;
  label: string;
  closable: boolean;
}

const DEFAULT_TABS: TabItem[] = [
  { key: '/', label: '首页', closable: false },
];

const TAB_LABELS: Record<string, string> = {
  '/': '首页',
  '/event-driven': '事件驱动',
  '/ai-account': 'AI账号',
  '/datasource-settings': '数据源',
  '/research-center': '策略研究',
};

export function Tabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeKey, setActiveKey] = useState('/');
  const [items, setItems] = useState<TabItem[]>(DEFAULT_TABS);

  // 根据路由更新tab
  useEffect(() => {
    const path = location.pathname;

    setActiveKey(path);

    setItems((currentItems) => {
      if (currentItems.some(item => item.key === path)) {
        return currentItems;
      }

      return [...currentItems, { key: path, label: TAB_LABELS[path] || '新页面', closable: path !== '/' }];
    });
  }, [location.pathname]);

  const onEdit = (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
    if (action === 'remove') {
      const key = typeof targetKey === 'string' ? targetKey : String(targetKey);
      const newItems = items.filter(item => item.key !== key);

      // 如果删除的是当前tab，需要切换到其他tab
      if (activeKey === key) {
        const lastIndex = newItems.length - 1;
        const newActiveKey = newItems[lastIndex]?.key || '/';
        setActiveKey(newActiveKey);
        navigate(newActiveKey);
      }

      setItems(newItems);
    }
  };

  const onChange = (key: string) => {
    setActiveKey(key);
    navigate(key);
  };

  return (
    <div className="workspace-tabs">
      <AntTabs
        type="editable-card"
        activeKey={activeKey}
        items={items}
        onChange={onChange}
        onEdit={onEdit}
        hideAdd
        className="workspace-tabs-inner"
      />
    </div>
  );
}
