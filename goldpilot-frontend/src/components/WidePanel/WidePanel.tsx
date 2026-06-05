import type { Event, Flash } from '@/types';

interface Source {
  name: string;
  text: string;
  url: string;
}

interface ActionItem {
  title: string;
  text: string;
}

interface WidePanelProps {
  title: string;
  pillText?: string;
  pillColor?: 'blue' | 'red' | 'green' | 'amber';
  events?: Event[];
  flashes?: Flash[];
  actions?: ActionItem[];
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

function renderRowTime(date: string | undefined, time: string) {
  return (
    <div className="row-time-stack" title={date ? `${date} ${time}` : time}>
      <span className="row-date">{formatDateLabel(date)}</span>
      <span className="row-time">{time}</span>
    </div>
  );
}

export function WidePanel({
  title,
  pillText,
  pillColor = 'blue',
  events = [],
  flashes = [],
  actions = [],
  sources = [],
}: WidePanelProps) {
  const getPillClass = () => {
    const colorMap = {
      blue: '',
      red: 'red',
      green: 'green',
      amber: 'amber',
    };
    return colorMap[pillColor];
  };

  return (
    <article className="card feed">
      <div className="panel-title">
        <strong>{title}</strong>
        {pillText && <span className={`pill ${getPillClass()}`}>{pillText}</span>}
      </div>

      <div className="scroll">
        {/* 渲染事件列表 */}
        {events.length > 0 && (
          <div className="event-list">
            {events.slice(0, 10).map((event, index) => {
              const sourceUrl = getUsableSourceUrl(event.source, event.sourceUrl);
              const content = (
                <>
                  {renderRowTime(event.date, event.time)}
                  <div className="row-text">
                    {event.star && <span className="star">{event.star}</span>}
                    <span>{event.text}</span>
                    {shouldShowSource(event.source) && <div className="mini-source">{event.source}</div>}
                  </div>
                </>
              );

              return sourceUrl ? (
                <a
                  key={index}
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="event-row source-row-link"
                  title="打开源头"
                >
                  {content}
                </a>
              ) : (
                <div key={index} className="event-row">
                  {content}
                </div>
              );
            })}
          </div>
        )}

        {/* 渲染快讯列表 */}
        {flashes.length > 0 && (
          <div className="flash-list">
            {flashes.slice(0, 10).map((flash, index) => {
              const sourceUrl = getUsableSourceUrl(flash.source, flash.sourceUrl);
              const content = (
                <>
                  {renderRowTime(flash.date, flash.time)}
                  <div className="flash-text">
                    <span>{flash.text}</span>
                    {shouldShowSource(flash.source) && <div className="mini-source">{flash.source}</div>}
                  </div>
                </>
              );

              return sourceUrl ? (
                <a
                  key={index}
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flash-row source-row-link ${flash.hot ? 'hot' : ''}`}
                  title="打开源头"
                >
                  {content}
                </a>
              ) : (
                <div key={index} className={`flash-row ${flash.hot ? 'hot' : ''}`}>
                  {content}
                </div>
              );
            })}
          </div>
        )}

        {/* 渲染动作列表 */}
        {actions.length > 0 && (
          <div className="action-list">
            {actions.map((action, index) => (
              <div key={index} className="action-item">
                <strong>{action.title}</strong>
                <div className="sub">{action.text}</div>
              </div>
            ))}
          </div>
        )}

        {/* 空状态 - 显示来源链接 */}
        {events.length === 0 && flashes.length === 0 && actions.length === 0 && sources.length > 0 && (
          <div className="empty-state">
            {sources.map((source, index) => (
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
        )}
      </div>
    </article>
  );
}
