import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  User,
  Send,
  X,
  RefreshCw,
  Database,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Minimize2,
  Maximize2,
  Copy,
  Check,
  GripHorizontal,
  Activity,
  AlertCircle,
  Search
} from 'lucide-react';

// Friendly rotating status phrases shown while the assistant is actively
// querying agentic_sre_db / itsm_db. Picked at random each time a new
// database call starts, so back-to-back queries don't repeat the same words.
// The exact table/db name is still shown in the trace accordion below each
// answer -- this is just the live "what's happening right now" indicator.
const DB_SEARCH_PHRASES = [
  'Digging through the database…',
  'Sifting through the records…',
  'Scanning live tables…',
  'Cross-referencing history…',
  'Pulling matching rows…',
  'Combing through the archives…'
];

const randomSearchPhrase = () => DB_SEARCH_PHRASES[Math.floor(Math.random() * DB_SEARCH_PHRASES.length)];

// Minimum window size -- small enough to still be usable, not so small the
// header/input controls start clipping.
const MIN_CHAT_WIDTH = 360;
const MIN_CHAT_HEIGHT = 400;

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface ToolTrace {
  db: string;
  query: string;
  rowCount?: number;
  reason?: string;
  error?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolTraces?: ToolTrace[];
  reachedMax?: boolean;
  timestamp: string;
}

const DEFAULT_PROMPTS = [
  { label: 'Pending Approvals', prompt: 'What approvals are currently pending in the Control Tower?' },
  { label: 'Highest MTTR', prompt: 'Which team has the highest average MTTR overall?' },
  { label: 'Execution Failures', prompt: 'Show the most recent failed execution audits and their target hosts.' },
  { label: 'Kill Switch Status', prompt: 'What is the current status of the Master Kill Switch and containment?' },
  { label: 'High-Risk Incidents', prompt: 'Summarize all P1 and high-risk incidents from the ITSM database.' },
  { label: 'Master SOP Articles', prompt: 'List the available Master SOPs in the Knowledge Base and their categories.' }
];

export const SREControlTowerChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openTraces, setOpenTraces] = useState<{ [msgId: string]: boolean }>({});
  const [currentAction, setCurrentAction] = useState<string>('');

  // Window position & size state for Draggable & Resizable window
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 480, height: 650 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0
  });

  const resizeRef = useRef<{ startX: number; startY: number; initW: number; initH: number; initX: number; initY: number; dir: ResizeDir }>({
    startX: 0,
    startY: 0,
    initW: 480,
    initH: 650,
    initX: 0,
    initY: 0,
    dir: 'se'
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '👋 **Hello! I am the SRE Control Tower Assistant.**\n\nI answer your operational questions using live queries against **agentic_sre_db** (approvals, audit history, timelines, containment) and **itsm_db** (incidents, CIs, knowledge articles).\n\n*How can I assist your investigation today?*',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !position) {
      const defaultW = 480;
      const defaultH = 650;
      setPosition({
        x: Math.max(20, window.innerWidth - defaultW - 24),
        y: Math.max(20, window.innerHeight - defaultH - 24)
      });
    }
  }, [position]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, currentAction]);

  // DRAG HANDLERS
  const handleMouseDownHeader = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setIsDragging(true);
    const currentX = position ? position.x : window.innerWidth - size.width - 24;
    const currentY = position ? position.y : window.innerHeight - size.height - 24;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentX,
      initY: currentY
    };
  };

  // RESIZE HANDLERS -- supports all 4 edges + 4 corners so the window can be
  // grown/shrunk from whichever side is convenient, not just the bottom-right
  // corner. Each direction resizes by keeping the *opposite* edge fixed
  // (e.g. dragging the left edge keeps the right edge in place), which is
  // what makes north/west resizing feel natural instead of the window
  // jumping.
  const handleMouseDownResize = (dir: ResizeDir) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const currentX = position ? position.x : window.innerWidth - size.width - 24;
    const currentY = position ? position.y : window.innerHeight - size.height - 24;
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initW: size.width,
      initH: size.height,
      initX: currentX,
      initY: currentY,
      dir
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const newX = Math.max(10, Math.min(window.innerWidth - size.width - 10, dragRef.current.initX + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - size.height - 10, dragRef.current.initY + dy));
        setPosition({ x: newX, y: newY });
      } else if (isResizing) {
        const { dir, startX, startY, initW, initH, initX, initY } = resizeRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxW = window.innerWidth - 20;
        const maxH = window.innerHeight - 20;

        let newW = initW;
        let newX = initX;
        if (dir.includes('e')) {
          newW = Math.min(maxW, Math.max(MIN_CHAT_WIDTH, initW + dx));
        } else if (dir.includes('w')) {
          const fixedRight = initX + initW;
          newW = Math.min(maxW, Math.max(MIN_CHAT_WIDTH, initW - dx));
          newX = fixedRight - newW;
        }

        let newH = initH;
        let newY = initY;
        if (dir.includes('s')) {
          newH = Math.min(maxH, Math.max(MIN_CHAT_HEIGHT, initH + dy));
        } else if (dir.includes('n')) {
          const fixedBottom = initY + initH;
          newH = Math.min(maxH, Math.max(MIN_CHAT_HEIGHT, initH - dy));
          newY = fixedBottom - newH;
        }

        newX = Math.max(10, Math.min(newX, window.innerWidth - newW - 10));
        newY = Math.max(10, Math.min(newY, window.innerHeight - newH - 10));

        setSize({ width: newW, height: newH });
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, size.width, size.height, position]);

  const toggleExpand = () => {
    if (!isExpanded) {
      const expW = Math.min(920, window.innerWidth - 60);
      const expH = Math.min(840, window.innerHeight - 60);
      setSize({ width: expW, height: expH });
      setPosition({
        x: Math.max(20, (window.innerWidth - expW) / 2),
        y: Math.max(20, (window.innerHeight - expH) / 2)
      });
      setIsExpanded(true);
    } else {
      const defW = 480;
      const defH = 650;
      setSize({ width: defW, height: defH });
      setPosition({
        x: Math.max(20, window.innerWidth - defW - 24),
        y: Math.max(20, window.innerHeight - defH - 24)
      });
      setIsExpanded(false);
    }
  };

  // REAL-TIME SSE STREAMING SEND HANDLER
  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      toolTraces: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMessage, initialAssistantMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setCurrentAction(randomSearchPhrase());

    try {
      const apiMessages = updatedMessages
        .filter(m => m.id !== 'welcome' && m.id !== assistantMsgId)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('http://localhost:5173/api/v1/agent/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: apiMessages })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let collectedTraces: ToolTrace[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const block of parts) {
          const lines = block.split('\n');
          let eventType = 'message';
          let dataStr = '';

          for (const l of lines) {
            if (l.startsWith('event: ')) {
              eventType = l.slice(7).trim();
            } else if (l.startsWith('data: ')) {
              dataStr = l.slice(6).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === 'tool_start') {
              setCurrentAction(randomSearchPhrase());
            } else if (eventType === 'tool_done') {
              collectedTraces.push(data);
              setCurrentAction(
                data.rowCount !== undefined
                  ? `Found ${data.rowCount} matching row${data.rowCount === 1 ? '' : 's'}…`
                  : randomSearchPhrase()
              );
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, toolTraces: [...collectedTraces] }
                    : m
                )
              );
            } else if (eventType === 'checkpoint') {
              setCurrentAction('12-step reasoning checkpoint reached. Summarizing findings...');
            } else if (eventType === 'token') {
              setCurrentAction('');
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + data.delta }
                    : m
                )
              );
            } else if (eventType === 'done') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: m.content || data.content,
                        toolTraces: data.toolTraces || collectedTraces,
                        reachedMax: data.reachedMax
                      }
                    : m
                )
              );
            } else if (eventType === 'error') {
              throw new Error(data.error || 'Streaming error');
            }
          } catch (e) {}
        }
      }
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `⚠️ **Query Error**: ${err.message || 'Failed to complete streaming response.'}\n\nPlease try again or provide clarification.`
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      setCurrentAction('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTrace = (msgId: string) => {
    setOpenTraces(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          '👋 **Session Cleared.**\n\nI am ready for fresh operational queries against **agentic_sre_db** and **itsm_db**.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const renderInlineFormatting = (text: string) => {
    const parts = text.split(/(\$\$.*?\$\$|\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1.5 py-0.5 bg-black/40 text-emerald-400 rounded-md font-mono text-[11px] border border-white/10">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const formatMarkdownContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Markdown Table Parser
      if (line.trim().startsWith('|') && line.includes('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].includes('-')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }

        if (tableLines.length >= 2) {
          const headerCells = tableLines[0]
            .split('|')
            .map(c => c.trim())
            .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);

          const rowLines = tableLines.slice(2);
          const rows = rowLines.map(r =>
            r
              .split('|')
              .map(c => c.trim())
              .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1)
          );

          elements.push(
            <div key={`table-${i}`} className="my-2.5 overflow-x-auto rounded-xl border border-white/10 bg-black/20 shadow-inner">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/[0.04] border-b border-white/10 text-cyan-300 font-semibold">
                    {headerCells.map((h, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 text-left font-medium tracking-wide">
                        {renderInlineFormatting(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-cyan-500/[0.06] transition-colors"
                    >
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-1.5 text-slate-200 font-mono text-[11px]">
                          {renderInlineFormatting(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      if (line.startsWith('### ')) {
        elements.push(<h4 key={i} className="font-semibold text-cyan-300 text-[13px] mt-2.5 mb-1">{line.replace('### ', '')}</h4>);
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(<h3 key={i} className="font-bold text-white text-sm mt-3 mb-1">{line.replace('## ', '')}</h3>);
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(<h2 key={i} className="font-extrabold text-white text-base mt-3.5 mb-1.5">{line.replace('# ', '')}</h2>);
        i++;
        continue;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        const bulletText = line.substring(2);
        elements.push(
          <li key={i} className="ml-4 list-disc marker:text-cyan-500/60 text-slate-200 text-[13px] leading-relaxed my-0.5">
            {renderInlineFormatting(bulletText)}
          </li>
        );
        i++;
        continue;
      }

      const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numberedMatch) {
        elements.push(
          <div key={i} className="flex items-start space-x-1.5 my-0.5 text-[13px] text-slate-200 ml-1">
            <span className="font-mono text-cyan-400 font-bold">{numberedMatch[1]}.</span>
            <span className="leading-relaxed">{renderInlineFormatting(numberedMatch[2])}</span>
          </div>
        );
        i++;
        continue;
      }

      if (line.startsWith('> ')) {
        elements.push(
          <div key={i} className="border-l-2 border-cyan-500/50 pl-2.5 py-0.5 my-1 text-slate-400 italic text-[13px]">
            {renderInlineFormatting(line.replace('> ', ''))}
          </div>
        );
        i++;
        continue;
      }

      if (line.trim() === '') {
        elements.push(<div key={i} className="h-1.5" />);
        i++;
        continue;
      }

      elements.push(
        <p key={i} className="text-[13px] leading-relaxed my-0.5 text-slate-200">
          {renderInlineFormatting(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-br from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white pl-3.5 pr-4.5 py-3 rounded-full shadow-[0_8px_30px_-8px_rgba(6,182,212,0.5)] hover:shadow-[0_8px_36px_-6px_rgba(6,182,212,0.65)] flex items-center space-x-2.5 z-40 border border-white/20 transition-all duration-200 transform hover:scale-[1.03] group"
          title="Open SRE Control Tower Assistant"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse" />
          </div>
          <span className="text-xs font-bold tracking-wide">SRE Assistant</span>
        </button>
      )}

      {/* Draggable & Resizable Assistant Window */}
      {isOpen && position && (
        <div
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${size.width}px`,
            height: `${size.height}px`
          }}
          className={`fixed z-50 flex flex-col bg-[rgba(10,13,22,0.92)] backdrop-blur-2xl border border-white/10 rounded-[20px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.75)] overflow-hidden select-text transition-shadow duration-200 ${
            isDragging ? 'shadow-[0_25px_70px_-10px_rgba(6,182,212,0.25)] opacity-95' : ''
          }`}
        >
          {/* Draggable Header */}
          <div
            onMouseDown={handleMouseDownHeader}
            className="relative bg-black/20 px-4 py-3 border-b border-white/[0.07] flex items-center justify-between cursor-move select-none group"
            title="Click and drag to move window anywhere on screen"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/25 to-violet-600/25 border border-white/10 flex items-center justify-center shadow-inner">
                <Bot className="w-4 h-4 text-cyan-300" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[13px] font-bold text-white tracking-wide">SRE Control Tower Assistant</span>
                  <span className="flex items-center gap-1 px-1.5 py-[3px] bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-semibold text-emerald-300 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                  <Database className="w-2.5 h-2.5 text-cyan-500/70" />
                  <span>agentic_sre_db &amp; itsm_db · read-only</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <div className="text-slate-600 group-hover:text-slate-500 px-1 transition-colors" title="Drag Window">
                <GripHorizontal className="w-4 h-4" />
              </div>
              <button
                onClick={clearChat}
                className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] rounded-lg transition-colors"
                title="Clear Conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={toggleExpand}
                className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] rounded-lg transition-colors"
                title={isExpanded ? 'Restore Size' : 'Maximize Window'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-white/[0.06] rounded-lg transition-colors"
                title="Close Assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Prompt Chips */}
          {messages.length <= 2 && (
            <div className="px-3.5 py-2.5 bg-black/10 border-b border-white/[0.06] flex flex-wrap gap-1.5 overflow-x-auto select-none">
              {DEFAULT_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(p.prompt)}
                  className="px-2.5 py-1.5 bg-white/[0.03] hover:bg-cyan-500/[0.1] border border-white/[0.08] hover:border-cyan-500/40 text-[11px] text-slate-300 hover:text-cyan-200 rounded-full transition-all duration-150 flex items-center space-x-1.5"
                >
                  <Sparkles className="w-2.5 h-2.5 text-violet-400" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex items-start gap-2 animate-message-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`w-6 h-6 mt-0.5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-white/[0.06] border border-white/10'
                      : 'bg-gradient-to-br from-cyan-500/25 to-violet-600/25 border border-white/10'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="w-3 h-3 text-slate-300" />
                  ) : (
                    <Bot className="w-3 h-3 text-cyan-300" />
                  )}
                </div>

                <div className={`flex flex-col min-w-0 max-w-[86%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {/* Meta row */}
                  <div className={`flex items-center gap-1.5 mb-1 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] font-medium text-slate-500">
                      {msg.role === 'user' ? 'You' : 'SRE Assistant'}
                    </span>
                    <span className="text-[9px] text-slate-600">{msg.timestamp}</span>
                  </div>

                  <div
                    className={`group/bubble relative rounded-2xl px-3.5 py-2.5 text-[13px] shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-cyan-600/90 text-white rounded-tr-sm'
                        : 'bg-white/[0.035] text-slate-200 border border-white/[0.07] rounded-tl-sm'
                    }`}
                  >
                    {/* 12-Iteration Checkpoint Notification Banner */}
                    {msg.reachedMax && (
                      <div className="mb-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center space-x-2 text-[11px] text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span>
                          <strong>Reasoning Checkpoint (12/12):</strong> Answer below to resume from this state.
                        </span>
                      </div>
                    )}

                    {/* Formatted Markdown Content with Tables. While the
                        response is still empty, this doubles as the live
                        "what's happening right now" indicator -- a single
                        rotating status line anchored where the answer will
                        appear, instead of a second detached loading row. */}
                    <div className="space-y-1">
                      {msg.content ? formatMarkdownContent(msg.content) : (
                        <span className="text-cyan-300/90 text-[11px] flex items-center space-x-2">
                          <Search className="w-3 h-3 animate-pulse flex-shrink-0" />
                          <span className="flex gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-typing-dot" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-typing-dot" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-typing-dot" style={{ animationDelay: '300ms' }} />
                          </span>
                          <span className="font-medium tracking-wide">{currentAction || 'Thinking…'}</span>
                        </span>
                      )}
                    </div>

                    {/* Live Database Query Traces Accordion */}
                    {msg.toolTraces && msg.toolTraces.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/[0.08]">
                        <button
                          onClick={() => toggleTrace(msg.id)}
                          className="w-full flex items-center justify-between text-[10px] text-cyan-300/90 hover:text-cyan-200 bg-black/20 px-2 py-1.5 rounded-lg border border-white/[0.06] transition-colors"
                        >
                          <span className="flex items-center space-x-1.5 font-mono">
                            <Database className="w-2.5 h-2.5" />
                            <span>{msg.toolTraces.length} live DB {msg.toolTraces.length === 1 ? 'query' : 'queries'}</span>
                          </span>
                          {openTraces[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {openTraces[msg.id] && (
                          <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                            {msg.toolTraces.map((trace, tIdx) => (
                              <div key={tIdx} className="p-2 bg-black/30 border border-white/[0.06] rounded-lg text-[10px] font-mono">
                                <div className="flex items-center justify-between text-slate-500 mb-1">
                                  <span className="text-cyan-300/90 font-semibold">{trace.db}</span>
                                  <span>{trace.rowCount !== undefined ? `${trace.rowCount} rows` : ''}</span>
                                </div>
                                <div className="text-emerald-400/90 break-all">{trace.query}</div>
                                {trace.error && <div className="text-rose-400 mt-1">Error: {trace.error}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Copy — revealed on hover */}
                    {msg.role === 'assistant' && msg.content && (
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="absolute -bottom-2 -right-2 p-1 bg-slate-800 border border-white/10 rounded-full text-slate-400 hover:text-cyan-300 opacity-0 group-hover/bubble:opacity-100 transition-opacity shadow-md"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-black/20 border-t border-white/[0.07] flex items-end space-x-2">
            <div className="flex-1 relative focus-within:shadow-[0_0_0_1px_rgba(6,182,212,0.4)] rounded-xl transition-shadow">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about live approvals, execution audits, timelines, or ITSM records..."
                rows={1}
                disabled={loading}
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none max-h-24 custom-scrollbar disabled:opacity-50 transition-colors"
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="p-2.5 bg-gradient-to-br from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 disabled:bg-white/[0.05] disabled:bg-none disabled:text-slate-600 text-white rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Send Query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Resize Handles -- all 4 edges + 4 corners, so the window can be
              grown/shrunk from whichever side is convenient. Edge strips are
              invisible (cursor-only affordance); corners carry a small hit
              target too since two edge strips would otherwise fight there. */}
          <div onMouseDown={handleMouseDownResize('n')} className="absolute top-0 left-2.5 right-2.5 h-1.5 cursor-n-resize z-10" title="Resize" />
          <div onMouseDown={handleMouseDownResize('s')} className="absolute bottom-0 left-2.5 right-2.5 h-1.5 cursor-s-resize z-10" title="Resize" />
          <div onMouseDown={handleMouseDownResize('w')} className="absolute left-0 top-2.5 bottom-2.5 w-1.5 cursor-w-resize z-10" title="Resize" />
          <div onMouseDown={handleMouseDownResize('e')} className="absolute right-0 top-2.5 bottom-2.5 w-1.5 cursor-e-resize z-10" title="Resize" />
          <div onMouseDown={handleMouseDownResize('nw')} className="absolute top-0 left-0 w-2.5 h-2.5 cursor-nw-resize z-20" title="Resize" />
          <div onMouseDown={handleMouseDownResize('ne')} className="absolute top-0 right-0 w-2.5 h-2.5 cursor-ne-resize z-20" title="Resize" />
          <div onMouseDown={handleMouseDownResize('sw')} className="absolute bottom-0 left-0 w-2.5 h-2.5 cursor-sw-resize z-20" title="Resize" />
          <div
            onMouseDown={handleMouseDownResize('se')}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20 flex items-end justify-end p-0.5 text-slate-500 hover:text-cyan-400 transition"
            title="Click and drag to resize chat window"
          >
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
              <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
};
