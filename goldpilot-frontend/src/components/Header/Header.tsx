import { useEffect, useState } from 'react';

interface HeaderProps {
  modeText?: string;
}

export function Header({ modeText = '演示模式' }: HeaderProps) {
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setCurrentDate(`${year}/${month}/${day}`);
    };

    updateDate();
    const timer = window.setInterval(updateDate, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="date-bar">
      <div className="brand-block">
        <div className="brand-name">GoldPilot 黄金交易决策驾驶舱</div>
        <div className="brand-sub">面向金融客户服务团队的事件驱动型交易辅助首页</div>
      </div>
      <div className="date-meta">
        <span className="pill green">{modeText}</span>
        <span className="status-dot" aria-hidden="true"></span>
        <span className="date-text">{currentDate || '----/--/--'}</span>
      </div>
    </header>
  );
}
