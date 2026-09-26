import { useEffect, useState } from 'react';
import api from '../api/client';

type EventType = 'rent' | 'overdue' | 'contract' | 'maintenance' | 'expense';
type TodoType = 'rent' | 'contract' | 'maintenance' | 'expense';
type TodoFilter = 'all' | 'rent' | 'contract' | 'maintenance' | 'expense';

interface CalendarData {
  events: Record<string, EventType[]>;
  todos: Array<{
    id: string;
    type: TodoType;
    title: string;
    subtitle: string;
    amount?: number;
    date: string;
    daysOverdue?: number;
    tags: string[];
  }>;
  year: number;
  month: number;
}

const EVENT_COLORS: Record<EventType, string> = {
  overdue: 'bg-red-400',
  rent: 'bg-orange-400',
  contract: 'bg-yellow-400',
  maintenance: 'bg-green-500',
  expense: 'bg-blue-400',
};

const FILTER_TABS: Array<{ key: TodoFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'rent', label: '收租' },
  { key: 'contract', label: '繳約' },
  { key: 'expense', label: '水電' },
  { key: 'maintenance', label: '報修' },
];

export default function CalendarModal({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<CalendarData | null>(null);
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/calendar?year=${year}&month=${month}`).then((r) => setData(r.data));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const filteredTodos = (data?.todos ?? []).filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'rent') return t.type === 'rent';
    if (filter === 'contract') return t.type === 'contract';
    if (filter === 'expense') return t.type === 'expense';
    if (filter === 'maintenance') return t.type === 'maintenance';
    return true;
  }).filter((t) => {
    if (!selectedDate) return true;
    return t.date.includes(selectedDate);
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-brand" />
            <span className="font-semibold text-sm text-gray-700">行事曆</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Calendar title */}
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-2xl font-bold text-gray-800 mb-0.5">租屋待辦</h2>
            <p className="text-xs text-gray-400">收租、繳約、水電與報修集中在這裡，下一階段會接 Google 行事曆。</p>
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between px-4 py-2">
            <div>
              <div className="font-semibold text-gray-700 text-sm">{year} 年 {month} 月</div>
              <div className="text-xs text-gray-400">有點點代表當天有租屋事件</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">‹</button>
              <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">›</button>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="px-3 pb-3">
            <div className="grid grid-cols-7 mb-1">
              {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {Array.from({ length: firstDayOfWeek }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = data?.events[dateStr] ?? [];
                const isToday = dateStr === now.toISOString().split('T')[0];
                const isSelected = selectedDate === String(day);

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(isSelected ? null : String(day))}
                    className={`flex flex-col items-center py-1 rounded-xl transition-colors ${
                      isSelected ? 'bg-brand text-white' :
                      isToday ? 'bg-brand text-white' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`text-sm font-medium ${isToday || isSelected ? 'text-white' : 'text-gray-700'}`}>{day}</span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                        {[...new Set(dayEvents)].slice(0, 3).map((type, idx) => (
                          <span key={idx} className={`w-1.5 h-1.5 rounded-full ${EVENT_COLORS[type]} ${isToday || isSelected ? 'opacity-70' : ''}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-3 px-4 pb-3 flex-wrap">
            {Object.entries(EVENT_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-xs text-gray-400">
                  {type === 'overdue' ? '逾期' : type === 'rent' ? '收租' : type === 'contract' ? '合約' : type === 'maintenance' ? '報修' : '水電'}
                </span>
              </div>
            ))}
          </div>

          {/* Todo list */}
          <div className="border-t border-gray-100">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="font-semibold text-gray-700">待辦清單</span>
              <span className="text-xs text-gray-400">{filteredTodos.length} 件</span>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    filter === tab.key ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Todo items */}
            <div className="px-4 pb-4 space-y-2">
              {filteredTodos.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">無待辦事項</div>
              ) : filteredTodos.map((todo) => (
                <div key={todo.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0 mt-0.5">
                        {todo.type === 'rent' && <MoneyIcon className="w-4 h-4 text-orange-400" />}
                        {todo.type === 'expense' && <DropIcon className="w-4 h-4 text-blue-400" />}
                        {todo.type === 'contract' && <DocIcon className="w-4 h-4 text-yellow-500" />}
                        {todo.type === 'maintenance' && <WrenchIcon className="w-4 h-4 text-green-500" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm text-gray-700">{todo.title}</span>
                          {todo.daysOverdue !== undefined && (
                            <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">逾期 {todo.daysOverdue} 天</span>
                          )}
                        </div>
                        {todo.subtitle && <div className="text-xs text-gray-500 mt-0.5">{todo.subtitle}</div>}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {todo.tags.map((tag) => (
                            <span key={tag} className="text-xs bg-brand/10 text-brand px-1.5 py-0.5 rounded">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-xs text-gray-400">{todo.date}</div>
                      {todo.amount !== undefined && (
                        <div className="text-sm font-semibold text-gray-700">NT${todo.amount.toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
function CloseIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}
function MoneyIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function DropIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c0 0-7 6.5-7 11a7 7 0 0014 0c0-4.5-7-11-7-11z" /></svg>;
}
function DocIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
}
function WrenchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
