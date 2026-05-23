interface MiniItem {
  time: string;
  star?: string;
  text: string;
  hot?: boolean;
}

interface Source {
  name: string;
  text: string;
  url: string;
}

interface MiniCardProps {
  title: string;
  pillText: string;
  pillColor?: 'blue' | 'amber' | 'red' | 'green';
  items: MiniItem[];
  sources?: Source[];
}

/**
 * 迷你卡片组件 - 完全按照index.html设计
 */
export function MiniCard({ title, pillText, pillColor = 'blue', items, sources = [] }: MiniCardProps) {
  const getPillClass = () => {
    return pillColor || '';
  };

  const hasItems = items && items.length > 0;

  return (
    <article className="card">
      <div className="card-title">
        <strong>{title}</strong>
        <span className={`pill ${getPillClass()}`}>{pillText}</span>
      </div>

      {hasItems ? (
        <div className="mini-list">
          {items.slice(0, 3).map((item, index) => (
            <div
              key={index}
              className={`mini-item ${item.hot ? 'hot' : ''}`}
            >
              <div className="mini-time">{item.time}</div>
              <div className="mini-body">
                {item.star && <span className="mr-1">{item.star}</span>}
                {item.text}
              </div>
            </div>
          ))}
        </div>
      ) : sources.length > 0 ? (
        <div className="empty-state">
          {sources.slice(0, 3).map((source, index) => (
            <div key={index} className="mini-item">
              <div className="mini-time">{new Date().toLocaleDateString('zh-CN')}</div>
              <div className="mini-body">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-link"
                >
                  {source.name}
                </a>
                <div className="mini-source">{source.text}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">暂无数据</div>
      )}
    </article>
  );
}
