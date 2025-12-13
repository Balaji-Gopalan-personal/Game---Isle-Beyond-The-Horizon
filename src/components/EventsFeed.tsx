import React, { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';

interface EventsFeedProps {
  events: Array<{ message: string; timestamp: string }>;
}

export const EventsFeed: React.FC<EventsFeedProps> = ({ events }) => {
  console.log('=== EVENTS FEED POSITIONING DEBUG ===');
  console.log('Events array length:', events.length);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Log computed styles once (mount only)
  useEffect(() => {
    const el = document.querySelector('.events-box') as HTMLElement;
    const parent = el?.parentElement!;
    if (el && parent) {
      console.log('EVBOX styles', getComputedStyle(el).cssText);
      console.log('PARENT styles', getComputedStyle(parent).cssText);
    }
  }, []);

  // Auto-scroll to latest event
  useEffect(() => {
    if (scrollRef.current && events.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Filter out empty events
  const filteredEvents = events.filter(event => event.message && event.message.trim() !== '');

  return (
    <div className="events-box h-full">
      {console.log('Events box rendered with red border for debugging')}
      <h2 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
        <Activity className="w-4 h-4" />
        Game Events
      </h2>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gray-50 rounded-lg p-2"
      >
        <div className="space-y-1">
          {filteredEvents.length === 0 ? (
            <div className="text-gray-500 text-xs italic text-center py-4">
              No events yet...
            </div>
          ) : (
            filteredEvents.map((event, index) => (
              <div
                key={index}
                className="bg-white p-2 rounded border border-gray-200 shadow-sm"
              >
                <div className="text-xs text-gray-500 mb-1">
                  {event.timestamp}
                </div>
                <div 
                  className="text-xs text-gray-700 leading-tight"
                  dangerouslySetInnerHTML={{ __html: event.message }}
                >
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};