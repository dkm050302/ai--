import type { Event, Flash } from '@/types';

interface EventListProps {
  events?: Event[];
  flashes?: Flash[];
  title?: string;
  showEvents?: boolean;
  showFlashes?: boolean;
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
        <span className={`pill ${showFlashes ? 'red' : ''}`}>
          {showFlashes ? `${itemCount} 条` : '北京时间'}
        </span>
      </div>

      <div className="scroll">
        {showEvents && events.map((event, index) => (
          <div key={index} className="event-row important">
            <div className="row-time">{event.time}</div>
            <div className="row-text">
              {event.star && <span className="mr-1">{event.star}</span>}
              {event.text}
            </div>
          </div>
        ))}

        {showFlashes && flashes.map((flash, index) => (
          <div key={index} className={`flash-row ${flash.hot ? 'hot' : ''}`}>
            <div className="row-time">{flash.time}</div>
            <div className="flash-text">{flash.text}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
