"use client";

import { useEffect, useRef } from 'react';

export default function DebugConsole({
  tableId,
  messages = [],
  input = "",
  onInputChange,
  onSubmit,
  onDealTest,
}) {
  const messageListRef = useRef(null);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) return;

    messageList.scrollTop = messageList.scrollHeight;
  }, [messages.length]);

  const getMessageClassName = (message) => {
    if (message.sender === 'Me') return 'text-cyan-400';
    if (message.sender === 'RTC') {
      if (message.level === 'error') return 'text-red-300';
      if (message.level === 'warn') return 'text-amber-300';
      return 'text-sky-300';
    }
    return 'text-teal-500';
  };

  const parseRtcMessage = (text = '') => {
    const meMatch = text.match(/^\[Me\]:\s+(.*)$/);
    if (meMatch) {
      return {
        peer: 'Me',
        separator: ':',
        body: meMatch[1],
      };
    }

    const match = text.match(/^([A-F0-9?]{2})\s+(.*)$/);
    if (!match) return null;

    return {
      peer: match[1],
      separator: '',
      body: match[2],
    };
  };

  return (
    <div className="absolute bottom-[0px] right-[0px] w-64 h-48 bg-slate-900/90 border border-teal-500/20 rounded-lg flex flex-col overflow-hidden backdrop-blur-md shadow-2xl z-30">
      <div className="bg-slate-950 px-3 py-1 border-b border-teal-500/10 flex justify-between">
        <span className="text-[9px] font-mono text-teal-500 uppercase">Comm_Link</span>
        <span className="text-[9px] font-mono text-slate-600">ID: {tableId}</span>
      </div>
      <button
        onClick={onDealTest}
        className="mt-2 w-full py-1 bg-teal-600 text-[9px] font-black uppercase tracking-tighter hover:bg-teal-400 text-slate-950 transition-colors"
      >
        Force Flop Deal (Broadcast)
      </button>
      <div ref={messageListRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
        {messages.map((message, index) => {
          const rtcMessage = message.sender === 'RTC' ? parseRtcMessage(message.text) : null;

          return (
            <div key={index} className={`text-[11px] font-mono ${getMessageClassName(message)}`}>
              {rtcMessage ? (
                <>
                  <span className="text-cyan-400 opacity-80">[{rtcMessage.peer}]</span>{rtcMessage.separator}{' '}
                  {rtcMessage.body}
                </>
              ) : message.sender === 'RTC' ? (
                <>{message.text}</>
              ) : (
                <>
                  <span className="opacity-50">[{message.sender}]:</span> {message.text}
                </>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="p-2 bg-slate-950/50">
        <input
          type="text"
          value={input}
          onChange={(event) => onInputChange?.(event.target.value)}
          placeholder="ENTER MESSAGE..."
          className="w-full bg-transparent border-none text-[11px] font-mono text-teal-400 focus:outline-none placeholder-teal-900"
        />
      </form>
    </div>
  );
}
