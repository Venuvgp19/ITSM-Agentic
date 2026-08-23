import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  User,
  Send,
  X,
  RefreshCw,
  Database,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Terminal,
  Layers,
  AlertCircle,
  Minimize2,
  Maximize2,
  Copy,
  Check
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
  timestamp: string;
}

const DEFAULT_PROMPTS = [
  { label: 'Pending Approvals', prompt: 'What approvals are currently pending in the Control Tower?' },
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const apiMessages = newMessages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('http://localhost:5173/api/v1/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: apiMessages })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned status ${res.status}`);
      }

      const data = await res.json();
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.content || 'No response generated.',
        toolTraces: data.toolTraces || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Query Error**: ${err.message || 'Failed to reach SRE Assistant backend service.'}\n\nPlease verify that the backend server is running and connected to PostgreSQL.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
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
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="font-bold text-indigo-300 text-sm mt-2 mb-1">{line.replace('### ', '')}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={idx} className="font-bold text-white text-base mt-2.5 mb-1">{line.replace('## ', '')}</h3>;
      }
      if (line.startsWith('# ')) {
        return <h2 key={idx} className="font-extrabold text-white text-lg mt-3 mb-1.5">{line.replace('# ', '')}</h2>;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        const bulletText = line.substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-slate-200 text-xs leading-relaxed my-0.5">
            {renderInlineFormatting(bulletText)}
          </li>
        );
      }

      const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numberedMatch) {
        return (
          <div key={idx} className="flex items-start space-x-1.5 my-0.5 text-xs text-slate-200 ml-1">
            <span className="font-mono text-indigo-400 font-bold">{numberedMatch[1]}.</span>
            <span className="leading-relaxed">{renderInlineFormatting(numberedMatch[2])}</span>
          </div>
        );
      }

      if (line.startsWith('> ')) {
        return (
          <div key={idx} className="border-l-2 border-indigo-500 pl-2.5 py-0.5 my-1 text-slate-400 italic text-xs">
            {renderInlineFormatting(line.replace('> ', ''))}
          </div>
        );
      }

      if (line.trim() === '') {
        return <div key={idx} className="h-2" />;
      }

      return (
        <p key={idx} className="text-xs leading-relaxed my-0.5 text-slate-200">
          {renderInlineFormatting(line)}
        </p>
      );
    });
  };

  return (
    <>
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

      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-200 flex flex-col bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden ${
            isExpanded
              ? 'bottom-4 right-4 w-[850px] h-[85vh]'
              : 'bottom-6 right-6 w-[440px] h-[640px]'
          }`}
        >
          <div className="bg-slate-950/80 px-4 py-3.5 border-b border-slate-800 flex items-center justify-between select-none">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-white">SRE Control Tower Assistant</span>
                  <span className="px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-500/40 text-[10px] font-semibold text-emerald-300 rounded">
                    LIVE DB
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <Database className="w-2.5 h-2.5 text-indigo-400" />
                  <span>agentic_sre_db & itsm_db (Read-Only)</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={clearChat}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-md transition"
                title="Clear Conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-md transition"
                title={isExpanded ? 'Collapse' : 'Expand'}
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

          {messages.length <= 2 && (
            <div className="px-3.5 py-2 bg-slate-950/40 border-b border-slate-800/50 flex flex-wrap gap-1.5 overflow-x-auto">
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

          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs shadow-md border ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white border-indigo-500/40 rounded-br-none'
                      : 'bg-slate-950/70 text-slate-200 border-slate-800/90 rounded-bl-none'
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
                      {msg.role === 'assistant' && (
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

                  <div className="space-y-1">{formatMarkdownContent(msg.content)}</div>

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

            {loading && (
              <div className="flex items-start space-x-2">
                <div className="p-3 bg-slate-950/70 border border-indigo-500/30 rounded-xl rounded-bl-none text-xs text-indigo-300 flex items-center space-x-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span className="text-[11px] font-medium">Querying live platform databases...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

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
        </div>
      )}
    </>
  );
};
