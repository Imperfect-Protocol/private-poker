"use client";

import { useEffect, useRef } from 'react';

const SENDER_COLOR_CLASSES = [
  'text-red-300',
  'text-emerald-300',
  'text-sky-300',
  'text-purple-300',
  'text-orange-300',
  'text-lime-200',
];

function colorIndexForSender(sender = '') {
  let hash = 0;
  for (let index = 0; index < sender.length; index += 1) {
    hash = (hash + sender.charCodeAt(index)) % SENDER_COLOR_CLASSES.length;
  }
  return hash;
}

export default function DebugConsole({
  tableId,
  messages = [],
  input = "",
  onInputChange,
  onSubmit,
  onDealTest,
}) {
  const messageListRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || !shouldAutoScrollRef.current) return;

    messageList.scrollTop = messageList.scrollHeight;
  }, [messages.length]);

  const handleMessageListScroll = () => {
    const messageList = messageListRef.current;
    if (!messageList) return;

    const distanceFromBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 12;
  };

  const getMessageClassName = (message) => {
    if (message.sender === 'Me') return 'text-cyan-400';
    if (message.sender && message.sender !== 'Game' && message.sender !== 'RTC') {
      return SENDER_COLOR_CLASSES[colorIndexForSender(message.sender)];
    }
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
    <div className="absolute bottom-[0px] right-[0px] w-[30rem] h-60 bg-slate-900/90 border border-teal-500/20 rounded-lg flex flex-col overflow-hidden backdrop-blur-md shadow-2xl z-[90]">
      <div className="bg-slate-950 px-3 py-1 border-b border-teal-500/10 flex justify-between">
        <span className="text-[11px] font-mono text-teal-500 uppercase">Comm_Link</span>
        <span className="text-[11px] font-mono text-slate-600">ID: {tableId}</span>
      </div>
      <button
        onClick={onDealTest}
        className="mt-2 w-full py-1 bg-teal-600 text-[11px] font-black uppercase tracking-tighter hover:bg-teal-400 text-slate-950 transition-colors"
      >
        State Broadcast Disabled
      </button>
      <div
        ref={messageListRef}
        onScroll={handleMessageListScroll}
        onWheel={(event) => event.stopPropagation()}
        className="flex-1 overflow-y-auto overscroll-contain p-3 flex flex-col gap-2 custom-scrollbar"
      >
        {messages.map((message, index) => {
          const rtcMessage = message.sender === 'RTC' ? parseRtcMessage(message.text) : null;
          const senderClassName = getMessageClassName(message);

          return (
            <div key={index} className={`text-[14px] font-mono ${senderClassName}`}>
              {rtcMessage ? (
                <>
                  <span className="text-cyan-400 opacity-80">[{rtcMessage.peer}]</span>{rtcMessage.separator}{' '}
                  {rtcMessage.body}
                </>
              ) : message.sender === 'RTC' ? (
                <>{message.text}</>
              ) : (
                <>
                  <span className={`${senderClassName} opacity-90`}>[{message.sender}]:</span> {message.text}
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
          className="w-full bg-transparent border-none text-[14px] font-mono text-teal-400 focus:outline-none placeholder-teal-900"
        />
      </form>
    </div>
  );
}
