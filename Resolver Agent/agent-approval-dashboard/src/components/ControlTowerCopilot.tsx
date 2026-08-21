import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Terminal,
  ChevronRight,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  Cpu,
  Layers,
  Server,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Activity,
  MessageSquareText,
  Search,
  Radio,
  CornerDownLeft
} from 'lucide-react';
import { AgentApproval } from './PendingApprovalsView';

interface CopilotProps {
  pendingApprovals: AgentApproval[];
  onRefreshNeeded: () => void;
  onApproveApproval?: (id: string, proposedCommands?: string[]) => void;
  onRejectApproval?: (id: string, reason: string) => void;
  activeTab?: string;
  isOpenOverride?: boolean;
  onToggle?: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actionExecuted?: {
    type: string;
    targetId?: string;
    success: boolean;
  };
  suggestedFollowUps?: string[];
}

export function ControlTowerCopilot({
  pendingApprovals,
  onRefreshNeeded,
  onApproveApproval,
  onRejectApproval,
  activeTab,
  isOpenOverride,
  onToggle,
}: CopilotProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const isOpen = isOpenOverride !== undefined ? isOpenOverride : internalOpen;
  const toggleOpen = onToggle || (() => setInternalOpen(!internalOpen));

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `👋 **21st.dev AI Copilot Active**\n\nI am your live ChatOps & SRE Governance copilot. Ask me to query RAG runbooks, retrieve Top 5 SOPs for any incident statement, or inspect live MTTR metrics.\n\n*How can I assist your operations?*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedFollowUps: [
        'Retrieve top 5 SOPs for BGP peer flapping',
        'Retrieve top 5 SOPs for Unix create 5 new users with sudo',
        'What is today\'s autonomous success rate & MTTR?',
        'Clear all host execution locks',
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('http://localhost:4000/api/v1/agent/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: historyPayload,
          context: {
            activeTab,
            selectedApprovalId: pendingApprovals[0]?.id,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Copilot API responded with status ${res.status}`);
      }

      const data = await res.json();

      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        role: 'assistant',
        content: data.response || 'Action completed.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionExecuted: data.actionExecuted,
        suggestedFollowUps: data.suggestedFollowUps,
      };

      setMessages((prev) => [...prev, botMsg]);

      if (data.actionExecuted && data.actionExecuted.success) {
        onRefreshNeeded();
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Copilot Connection Error**: ${err.message}. Please verify the backend service on port 4000 is active.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const renderMessageContent = (content: string, msgId: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const firstLine = lines[0].trim();
        const isLang = /^[a-z0-9_-]+$/i.test(firstLine);
        const lang = isLang ? firstLine : 'bash';
        const code = isLang ? lines.slice(1).join('\n') : lines.join('\n');
        const codeId = `${msgId}_code_${index}`;

        return (
          <div key={index} className="my-2.5 rounded-xl overflow-hidden border border-zinc-800 bg-[#09090b] shadow-xl">
            {/* 21st.dev Code Window Header with Mac Dots */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-400 font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500/80" />
                <span className="w-2 h-2 rounded-full bg-amber-500/80" />
                <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
                <span className="ml-1 text-cyan-400 font-bold uppercase">{lang}</span>
              </div>
              <button
                onClick={() => copyToClipboard(code, codeId)}
                className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
              >
                {copiedCodeId === codeId ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 text-xs text-zinc-200 font-mono overflow-x-auto whitespace-pre leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      const formatted = part
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 py-0.5 rounded text-cyan-300 font-mono text-[11px]">$1</code>')
        .replace(/\n/g, '<br/>');

      return (
        <span
          key={index}
          dangerouslySetInnerHTML={{ __html: formatted }}
          className="leading-relaxed text-xs md:text-sm"
        />
      );
    });
  };

  return (
    <>
      {/* 21st.dev Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={toggleOpen}
          className="fixed bottom-6 right-6 z-50 p-3.5 rounded-2xl bg-zinc-900 text-zinc-100 border border-zinc-700/80 shadow-2xl hover:border-cyan-500/60 hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 font-bold cursor-pointer group"
        >
          <div className="relative">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-zinc-950 font-black shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-zinc-950 fill-zinc-950" />
            </div>
            {pendingApprovals.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
            )}
          </div>
          <span className="text-xs font-bold text-zinc-100 hidden sm:inline">AI Copilot</span>
          {pendingApprovals.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold">
              {pendingApprovals.length}
            </span>
          )}
        </button>
      )}

      {/* 21st.dev Chat Drawer */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 ${
            isExpanded
              ? 'inset-4 md:inset-8 w-auto h-auto'
              : 'bottom-4 right-4 w-[95vw] sm:w-[460px] h-[640px] max-h-[90vh]'
          } rounded-2xl bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800 shadow-2xl flex flex-col overflow-hidden`}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <div className="ml-2">
                <h3 className="font-extrabold text-white text-xs flex items-center gap-1.5">
                  21st.dev AI SRE Copilot
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    Llama-3.3 70B
                  </span>
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([messages[0]])}
                title="Clear Chat History"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Restore' : 'Expand'}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={toggleOpen}
                title="Close"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                  )}

                  <div className={`space-y-1.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-3 rounded-xl text-xs leading-relaxed ${
                        isUser
                          ? 'bg-zinc-100 text-zinc-950 font-medium rounded-tr-sm shadow-md'
                          : 'bg-zinc-900/90 border border-zinc-800 text-zinc-200 rounded-tl-sm shadow-md'
                      }`}
                    >
                      {renderMessageContent(msg.content, msg.id)}
                    </div>

                    <div className={`flex items-center gap-2 px-1 text-[10px] text-zinc-500 font-mono ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <span>{msg.timestamp}</span>
                    </div>

                    {!isUser && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        {msg.suggestedFollowUps.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(suggestion)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border border-zinc-800 hover:border-cyan-500/40 transition-all cursor-pointer text-left"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-cyan-400 shrink-0">
                  <Bot className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-cyan-400 text-xs font-medium flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  Executing RAG retrieval & LLM reasoning...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-4 py-2 bg-zinc-950/80 border-t border-zinc-800/80 overflow-x-auto flex gap-1.5 no-scrollbar">
            <button
              onClick={() => handleSendMessage('retrieve top 5 SOPs for BGP peer session flapping on switch')}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 rounded-lg text-[10px] font-medium whitespace-nowrap border border-zinc-800 transition cursor-pointer"
            >
              ⚡ Top 5 SOPs for BGP
            </button>
            <button
              onClick={() => handleSendMessage('retrieve top 5 SOPs for Unix create 5 new users with sudo access')}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 rounded-lg text-[10px] font-medium whitespace-nowrap border border-zinc-800 transition cursor-pointer"
            >
              👤 Unix 5 Users SOP
            </button>
            <button
              onClick={() => handleSendMessage('what is today\'s autonomous success rate & MTTR?')}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 rounded-lg text-[10px] font-medium whitespace-nowrap border border-zinc-800 transition cursor-pointer"
            >
              📊 Today's MTTR
            </button>
            <button
              onClick={() => handleSendMessage('clear all host execution locks')}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-300 rounded-lg text-[10px] font-medium whitespace-nowrap border border-zinc-800 transition cursor-pointer"
            >
              🔓 Reset Locks
            </button>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-zinc-900/95 border-t border-zinc-800 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Query Copilot, retrieve Top 5 SOPs, or authorize runbooks..."
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="p-2 rounded-xl bg-zinc-100 text-zinc-950 font-bold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
