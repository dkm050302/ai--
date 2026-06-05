import type { Event, Flash } from '@/types';

/**
 * 事件列表组件 - 完全按照index.html设计
 */
interface EventListProps {
  events?: Event[];
  flashes?: Flash[];
  title?: string;
  showEvents?: boolean;
  showFlashes?: boolean;
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

function splitNewsText(text: string): { title: string; summary: string } {
  const match = text.match(/^【([^】]+)】([\s\S]*)$/);
  if (!match) return { title: text, summary: '' };
  return {
    title: match[1],
    summary: match[2].trim(),
  };
}

export function EventList({
  events = [],
  flashes = [],
  title,
  showEvents = true,
  showFlashes = true,
}: EventListProps) {
  const displayTitle = title || (showEvents ? '美国重要事件明细' : '市场快讯流');
  const itemCount = showEvents ? events.length : flashes.length;

  return (
    <article className="card feed">
      <div className="panel-title">
        <strong>{displayTitle}</strong>
        <span
          className={`pill ${showFlashes
            ? 'red'
            : ''}`}
        >
          {showFlashes ? `${itemCount} 条` : '北京时间'}
        </span>
      </div>

      <div className="scroll">
        {showEvents &&
          events.map((event, index) => {
            const sourceUrl = getUsableSourceUrl(event.source, event.sourceUrl);
            const content = (
              <>
                {renderRowTime(event.date, event.time)}
                <div className="row-text">
                  {event.star && <span className="mr-1">{event.star}</span>}
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
                className="event-row important source-row-link"
                title="打开源头"
              >
                {content}
              </a>
            ) : (
              <div key={index} className="event-row important">
                {content}
              </div>
            );
          })}

        {showFlashes &&
          flashes.map((flash, index) => {
            const sourceUrl = getUsableSourceUrl(flash.source, flash.sourceUrl);
            const news = splitNewsText(flash.text);
            const content = (
              <>
                {renderRowTime(flash.date, flash.time)}
                <div className="flash-text">
                  <strong className="flash-title">{news.title}</strong>
                  {news.summary && <span className="flash-summary">{news.summary}</span>}
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
              <div
                key={index}
                className={`flash-row ${flash.hot ? 'hot' : ''}`}
              >
                {content}
              </div>
            );
          })}
      </div>
    </article>
  );
}
