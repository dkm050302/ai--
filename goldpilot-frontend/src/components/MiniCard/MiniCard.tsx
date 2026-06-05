interface MiniItem {
  date?: string;
  time: string;
  star?: string;
  text: string;
  hot?: boolean;
  source?: string;
  sourceUrl?: string;
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

function shouldShowSource(source?: string): boolean {
  return !!source && source !== '模拟数据';
}

function getFallbackSourceUrl(source?: string): string | undefined {
  if (source === 'Trading Economics') return 'https://tradingeconomics.com/calendar';
  if (source === '东方财富快讯') return 'https://kuaixun.eastmoney.com/index.html';
  return undefined;
}

function getUsableSourceUrl(source?: string, sourceUrl?: string): string | undefined {
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  return getFallbackSourceUrl(source);
}

function formatDateLabel(date?: string): string {
  if (!date) {
    return new Date().toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '/');
  }

  const normalized = date.replace(/\//g, '-');
  const parts = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) return `${parts[2]}/${parts[3]}`;
  return date;
}

function renderTimeBlock(date: string | undefined, time: string) {
  return (
    <div className="mini-time-stack" title={date ? `${date} ${time}` : time}>
      <span className="mini-date">{formatDateLabel(date)}</span>
      <span className="mini-time">{time}</span>
    </div>
  );
}

function getHeadline(text: string): string {
  const match = text.match(/^【([^】]+)】/);
  return match ? match[1] : text;
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
          {items.slice(0, 3).map((item, index) => {
            const sourceUrl = getUsableSourceUrl(item.source, item.sourceUrl);
            const content = (
              <>
                {renderTimeBlock(item.date, item.time)}
                <div className="mini-body">
                  {item.star && <span className="mr-1">{item.star}</span>}
                  <span className="mini-text">{getHeadline(item.text)}</span>
                  {shouldShowSource(item.source) && <div className="mini-source">{item.source}</div>}
                </div>
              </>
            );

            return sourceUrl ? (
              <a
                key={index}
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`mini-item source-row-link ${item.hot ? 'hot' : ''}`}
                title="打开源头"
              >
                {content}
              </a>
            ) : (
              <div
                key={index}
                className={`mini-item ${item.hot ? 'hot' : ''}`}
              >
                {content}
              </div>
            );
          })}
        </div>
      ) : sources.length > 0 ? (
        <div className="empty-state">
          {sources.slice(0, 3).map((source, index) => (
            <a
              key={index}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mini-item source-row-link"
            >
              {renderTimeBlock(undefined, '源头')}
              <div className="mini-body">
                <span>{source.name}</span>
                <div className="mini-source">{source.text}</div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty-state">暂无数据</div>
      )}
    </article>
  );
}
