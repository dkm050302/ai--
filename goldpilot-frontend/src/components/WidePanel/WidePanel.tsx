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
            {events.slice(0, 10).map((event, index) => (
              <div key={index} className="event-row">
                <div className="row-time">{event.time}</div>
                <div className="row-text">
                  {event.star && <span className="star">{event.star}</span>}
                  {event.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 渲染快讯列表 */}
        {flashes.length > 0 && (
          <div className="flash-list">
            {flashes.slice(0, 10).map((flash, index) => (
              <div key={index} className={`flash-row ${flash.hot ? 'hot' : ''}`}>
                <div className="row-time">{flash.time}</div>
                <div className="flash-text">{flash.text}</div>
              </div>
            ))}
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
