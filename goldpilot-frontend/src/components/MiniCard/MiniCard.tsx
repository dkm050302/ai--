interface MiniItem {
  time: string;
  star?: string;
  text: string;
  hot?: boolean;
}

interface MiniCardProps {
  title: string;
  pillText: string;
  pillColor?: 'blue' | 'amber' | 'red' | 'green';
  items: MiniItem[];
}

/**
 * 迷你卡片组件 - 完全按照index.html设计
 */
export function MiniCard({ title, pillText, pillColor = 'blue', items }: MiniCardProps) {
  const getPillClass = () => {
    return pillColor || '';
  };

  return (
    <article className="card">
      <div className="card-title">
        <strong>{title}</strong>
        <span className={`pill ${getPillClass()}`}>{pillText}</span>
      </div>

      <div className="mini-list">
        {items.slice(0, 3).map((item, index) => (
          <div
            key={index}
            className={`mini-item ${item.hot ? 'hot' : ''}`}
          >
            <div className="mini-time">{item.time}</div>
            <div>
              {item.star && <span className="mr-1">{item.star}</span>}
              {item.text}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
