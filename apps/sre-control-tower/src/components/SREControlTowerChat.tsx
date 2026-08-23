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
  AlertCircle
} from 'lucide-react';

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

  const resizeRef = useRef<{ startX: number; startY: number; initW: number; initH: number }>({
    startX: 0,
    startY: 0,
    initW: 480,
    initH: 650
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

  // RESIZE HANDLERS
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initW: size.width,
      initH: size.height
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
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        const newW = Math.max(360, Math.min(window.innerWidth - (position?.x || 0) - 10, resizeRef.current.initW + dx));
        const newH = Math.max(400, Math.min(window.innerHeight - (position?.y || 0) - 10, resizeRef.current.initH + dy));
        setSize({ width: newW, height: newH });
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
    setCurrentAction('Analyzing query & introspecting databases...');

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
              setCurrentAction(`Running SQL on ${data.tool === 'query_sre_database' ? 'agentic_sre_db' : 'itsm_db'} (step ${data.iteration}/12)...`);
            } else if (eventType === 'tool_done') {
              collectedTraces.push(data);
              setCurrentAction(`Retrieved ${data.rowCount !== undefined ? `${data.rowCount} rows` : 'schema'} from ${data.db}`);
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
        return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1.5 py-0.5 bg-slate-950 text-emerald-400 rounded font-mono text-[11px] border border-slate-800">
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
            <div key={`table-${i}`} className="my-2.5 overflow-x-auto rounded-lg border border-slate-700/80 bg-slate-950/90 shadow-md">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/95 border-b border-slate-700 text-indigo-300 font-semibold">
                    {headerCells.map((h, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 text-left font-medium tracking-wide">
                        {renderInlineFormatting(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-indigo-950/30 transition-colors odd:bg-slate-950/40 even:bg-slate-900/40"
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
        elements.push(<h4 key={i} className="font-bold text-indigo-300 text-sm mt-2.5 mb-1">{line.replace('### ', '')}</h4>);
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(<h3 key={i} className="font-bold text-white text-base mt-3 mb-1">{line.replace('## ', '')}</h3>);
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(<h2 key={i} className="font-extrabold text-white text-lg mt-3.5 mb-1.5">{line.replace('# ', '')}</h2>);
        i++;
        continue;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        const bulletText = line.substring(2);
        elements.push(
          <li key={i} className="ml-4 list-disc text-slate-200 text-xs leading-relaxed my-0.5">
            {renderInlineFormatting(bulletText)}
          </li>
        );
        i++;
        continue;
      }

      const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numberedMatch) {
        elements.push(
          <div key={i} className="flex items-start space-x-1.5 my-0.5 text-xs text-slate-200 ml-1">
            <span className="font-mono text-indigo-400 font-bold">{numberedMatch[1]}.</span>
            <span className="leading-relaxed">{renderInlineFormatting(numberedMatch[2])}</span>
          </div>
        );
        i++;
        continue;
      }

      if (line.startsWith('> ')) {
        elements.push(
          <div key={i} className="border-l-2 border-indigo-500 pl-2.5 py-0.5 my-1 text-slate-400 italic text-xs">
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
        <p key={i} className="text-xs leading-relaxed my-0.5 text-slate-200">
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
          className="fixed bottom-6 right-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-3 rounded-full shadow-2xl flex items-center space-x-2.5 z-40 border border-indigo-400/40 transition-all transform hover:scale-105 group"
          title="Open SRE Control Tower Assistant"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-indigo-100 group-hover:animate-bounce" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
          </div>
          <span className="text-xs font-bold tracking-wide pr-1">SRE Assistant</span>
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
          className={`fixed z-50 flex flex-col bg-slate-900/95 backdrop-blur-xl border border-indigo-500/35 rounded-2xl shadow-2xl overflow-hidden select-text transition-shadow duration-150 ${
            isDragging ? 'shadow-indigo-500/20 shadow-2xl opacity-95' : ''
          }`}
        >
          {/* Draggable Header */}
          <div
            onMouseDown={handleMouseDownHeader}
            className="bg-slate-950/90 px-4 py-3 border-b border-slate-800 flex items-center justify-between cursor-move select-none group"
            title="Click and drag to move window anywhere on screen"
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white tracking-wide">SRE Control Tower Assistant</span>
                  <span className="px-1.5 py-0.2 bg-emerald-950/70 border border-emerald-500/40 text-[9px] font-semibold text-emerald-300 rounded">
                    LIVE DB • SSE STREAM
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Database className="w-2.5 h-2.5 text-indigo-400" />
                  <span>agentic_sre_db & itsm_db (Read-Only)</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <div className="text-slate-600 group-hover:text-slate-400 px-1" title="Drag Window">
                <GripHorizontal className="w-4 h-4" />
              </div>
              <button
                onClick={clearChat}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-md transition"
                title="Clear Conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={toggleExpand}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-md transition"
                title={isExpanded ? 'Restore Size' : 'Maximize Window'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-md transition"
                title="Close Assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Prompt Chips */}
          {messages.length <= 2 && (
            <div className="px-3.5 py-2 bg-slate-950/40 border-b border-slate-800/50 flex flex-wrap gap-1.5 overflow-x-auto select-none">
              {DEFAULT_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(p.prompt)}
                  className="px-2.5 py-1 bg-slate-800/70 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-[11px] text-slate-300 hover:text-indigo-200 rounded-full transition-all flex items-center space-x-1"
                >
                  <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[95%] rounded-xl px-3.5 py-2.5 text-xs shadow-md border ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white border-indigo-500/40 rounded-br-none'
                      : 'bg-slate-950/80 text-slate-200 border-slate-800/90 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center justify-between space-x-2 mb-1.5 pb-1 border-b border-white/10">
                    <span className="font-semibold text-[10px] tracking-wide flex items-center space-x-1">
                      {msg.role === 'user' ? (
                        <>
                          <User className="w-3 h-3 text-indigo-200" />
                          <span>You (Operator)</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3 h-3 text-indigo-400" />
                          <span className="text-indigo-300">SRE Assistant</span>
                        </>
                      )}
                    </span>
                    <div className="flex items-center space-x-1.5 text-[9px] text-slate-400">
                      <span>{msg.timestamp}</span>
                      {msg.role === 'assistant' && msg.content && (
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="hover:text-white transition"
                          title="Copy message"
                        >
                          {copiedId === msg.id ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 12-Iteration Checkpoint Notification Banner */}
                  {msg.reachedMax && (
                    <div className="mb-2 p-2 bg-amber-950/50 border border-amber-500/40 rounded-lg flex items-center space-x-2 text-[11px] text-amber-300">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span>
                        <strong>Reasoning Checkpoint (Iteration 12/12):</strong> Checkpoint reached. Answer the question below to resume from this state.
                      </span>
                    </div>
                  )}

                  {/* Formatted Markdown Content with Tables */}
                  <div className="space-y-1">
                    {msg.content ? formatMarkdownContent(msg.content) : (
                      <span className="text-indigo-300 animate-pulse text-[11px] flex items-center space-x-1.5">
                        <Activity className="w-3 h-3 animate-spin text-indigo-400" />
                        <span>Streaming live database query response...</span>
                      </span>
                    )}
                  </div>

                  {/* Live Database Query Traces Accordion */}
                  {msg.toolTraces && msg.toolTraces.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => toggleTrace(msg.id)}
                        className="w-full flex items-center justify-between text-[10px] text-indigo-400 hover:text-indigo-300 bg-slate-900/60 px-2 py-1 rounded border border-indigo-500/20"
                      >
                        <span className="flex items-center space-x-1 font-mono">
                          <Database className="w-2.5 h-2.5 text-indigo-400" />
                          <span>{msg.toolTraces.length} Live DB Queries Executed</span>
                        </span>
                        {openTraces[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {openTraces[msg.id] && (
                        <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto">
                          {msg.toolTraces.map((trace, tIdx) => (
                            <div key={tIdx} className="p-2 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono">
                              <div className="flex items-center justify-between text-slate-400 mb-1">
                                <span className="text-indigo-300 font-semibold">{trace.db}</span>
                                <span>{trace.rowCount !== undefined ? `${trace.rowCount} rows` : ''}</span>
                              </div>
                              <div className="text-emerald-400 break-all">{trace.query}</div>
                              {trace.error && <div className="text-rose-400 mt-1">Error: {trace.error}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Real-time Streaming Activity Indicator */}
            {loading && currentAction && (
              <div className="flex items-start space-x-2">
                <div className="p-2.5 bg-slate-950/80 border border-indigo-500/40 rounded-xl rounded-bl-none text-xs text-indigo-300 flex items-center space-x-2 shadow-lg">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span className="text-[11px] font-medium tracking-wide">{currentAction}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-end space-x-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about live approvals, execution audits, timelines, or ITSM records..."
                rows={1}
                disabled={loading}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none max-h-24 custom-scrollbar disabled:opacity-50"
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition shadow flex items-center justify-center"
              title="Send Query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Corner Resize Drag Handle */}
          <div
            onMouseDown={handleMouseDownResize}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 text-slate-500 hover:text-indigo-400 transition"
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
