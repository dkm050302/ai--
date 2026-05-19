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

export function Tabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeKey, setActiveKey] = useState('/');
  const [items, setItems] = useState<TabItem[]>(DEFAULT_TABS);

  // 根据路由更新tab
  useEffect(() => {
    const path = location.pathname;

    // 更新activeKey
    setActiveKey(path);

    // 检查当前路径是否已在tabs中
    const existingTab = items.find(item => item.key === path);

    if (!existingTab) {
      // 添加新tab
      let label = '新页面';
      if (path === '/mt4-account') {
        label = 'MT4账号管理';
      }

      setItems([...items, { key: path, label, closable: true }]);
    }
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
    <div className="bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
      <AntTabs
        type="editable-card"
        activeKey={activeKey}
        items={items}
        onChange={onChange}
        onEdit={onEdit}
        hideAdd
        className="px-6"
        style={{ minHeight: '48px' }}
      />
    </div>
  );
}
