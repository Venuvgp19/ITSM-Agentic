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
  Zap,
  Terminal,
  ChevronRight,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  Cpu,
  Layers
} from 'lucide-react';
import { AgentApproval } from './PendingApprovalsView';

interface CopilotProps {
  pendingApprovals: AgentApproval[];
  onRefreshNeeded: () => void;
  onApproveApproval?: (id: string, proposedCommands?: string[]) => void;
  onRejectApproval?: (id: string, reason: string) => void;
  activeTab?: string;
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
}: CopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Welcome to Control Tower SRE Copilot**\n\nI am your live ChatOps & AI Governance Assistant. I have real-time visibility into pending approvals, agent execution traces, and cluster telemetry.\n\nHow can I assist your operations today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedFollowUps: [
        'Explain pending approvals and risk',
        'What is today\'s autonomous success rate & MTTR?',
        'Clear all host execution locks',
        'Generate shift handover summary',
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [messages, isOpen, isMinimized]);

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

      // If an action was executed (e.g. approved or locks cleared), trigger dashboard refresh
      if (data.actionExecuted && data.actionExecuted.success) {
        onRefreshNeeded();
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Connection Error**: Could not connect to Copilot API (${err.message}). Falling back to local diagnostic telemetry.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedFollowUps: ['Retry query', 'Clear all host execution locks'],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        role: 'assistant',
        content: `🧹 **Chat history cleared.** Ready for new ChatOps directives or telemetry queries.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedFollowUps: [
          'Explain pending approvals and risk',
          'What is today\'s autonomous success rate & MTTR?',
          'Generate shift handover summary',
        ],
      },
    ]);
  };

  // Render Markdown-like formatted message content
  const renderMessageContent = (content: string, msgId: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
      <div className="space-y-2 text-sm leading-relaxed">
        {parts.map((part, index) => {
          if (part.startsWith('```')) {
            const lines = part.slice(3, -3).trim().split('\n');
            const lang = lines[0]?.match(/^[a-z]+/i) ? lines[0] : '';
            const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
            const codeBlockId = `${msgId}_code_${index}`;

            return (
              <div key={index} className="my-2 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950/90 shadow-inner">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    {lang || 'bash'}
                  </span>
                  <button
                    onClick={() => handleCopyCode(code, codeBlockId)}
                    className="flex items-center gap-1 hover:text-white transition-colors text-slate-400"
                    title="Copy code"
                  >
                    {copiedCodeId === codeBlockId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 text-[10px]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          // Format bold and bullet points
          const paragraphs = part.split('\n');
          return (
            <div key={index} className="space-y-1">
              {paragraphs.map((p, pIdx) => {
                if (!p.trim()) return null;
                const formatted = p
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                  .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 font-mono text-xs">$1</code>');

                if (p.startsWith('- ') || p.startsWith('* ')) {
                  return (
                    <div
                      key={pIdx}
                      className="flex items-start gap-2 pl-1"
                      dangerouslySetInnerHTML={{
                        __html: `<span class="text-indigo-400 font-bold">•</span> ${formatted.substring(2)}`,
                      }}
                    />
                  );
                }

                if (p.startsWith('### ')) {
                  return (
                    <h4
                      key={pIdx}
                      className="text-xs uppercase tracking-wider font-bold text-indigo-300 mt-2 mb-1"
                      dangerouslySetInnerHTML={{ __html: formatted.substring(4) }}
                    />
                  );
                }

                return (
                  <p key={pIdx} dangerouslySetInnerHTML={{ __html: formatted }} />
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
            }}
            className="group relative flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-2xl shadow-indigo-500/40 hover:shadow-indigo-500/60 hover:scale-105 active:scale-95 transition-all duration-300 border border-indigo-400/40 font-medium text-sm"
          >
            <div className="relative">
              <Sparkles className="w-5 h-5 animate-spin-slow text-amber-300" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <span>Control Tower Copilot</span>

            {pendingApprovals.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-slate-950 rounded-full animate-bounce shadow-md">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Floating Copilot Drawer Window */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 transition-all duration-300 flex flex-col bg-slate-900/95 backdrop-blur-2xl border border-indigo-500/30 rounded-3xl shadow-2xl shadow-indigo-950/80 overflow-hidden ${
            isMinimized
              ? 'w-80 h-16'
              : 'w-[440px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-4rem)]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border-b border-indigo-500/20 select-none">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30">
                <Bot className="w-4 h-4" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-wide">SRE AI Copilot</h3>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Llama 3.3
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Autonomous Governance & ChatOps</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 text-slate-400">
              <button
                onClick={handleClearHistory}
                className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Clear Chat History"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-rose-900/40 hover:text-rose-300 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Context Telemetry Bar */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950/60 border-b border-slate-800/80 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  Pending: <strong className="text-white">{pendingApprovals.length}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Mode: <strong className="text-emerald-400">Continuous HITL</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Tab: <strong className="text-slate-300 capitalize">{activeTab || 'Approvals'}</strong>
                </span>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl p-3.5 shadow-lg ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none border border-indigo-400/30'
                          : 'bg-slate-800/90 text-slate-200 rounded-bl-none border border-slate-700/60 shadow-slate-950/50'
                      }`}
                    >
                      {renderMessageContent(msg.content, msg.id)}

                      {/* Render Interactive Action Pill if approval action is referenced */}
                      {msg.actionExecuted && (
                        <div className="mt-3 pt-2.5 border-t border-slate-700/80 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> Action Applied: {msg.actionExecuted.type}
                          </span>
                          <button
                            onClick={onRefreshNeeded}
                            className="text-[11px] text-indigo-300 hover:text-white flex items-center gap-1 underline underline-offset-2"
                          >
                            <RotateCcw className="w-3 h-3" /> Refresh UI
                          </button>
                        </div>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">
                      {msg.timestamp}
                    </span>

                    {/* Render Quick Follow-Up Pills */}
                    {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                        {msg.suggestedFollowUps.map((prompt, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => handleSendMessage(prompt)}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-400 transition-all flex items-center gap-1 shadow-sm active:scale-95 text-left"
                          >
                            <ChevronRight className="w-3 h-3 text-indigo-400" />
                            <span>{prompt}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-start gap-2.5">
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs text-indigo-300">
                      <Cpu className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Copilot is analyzing telemetry & ground truth...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3.5 bg-slate-950/80 border-t border-slate-800/80">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2 bg-slate-900/90 rounded-2xl border border-indigo-500/30 px-3 py-1.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-inner"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask Copilot (e.g. 'Approve APPR-1818', 'Show MTTR')..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none py-1.5"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isLoading}
                    className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all shadow-md shadow-indigo-500/30"
                    title="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                <div className="flex items-center justify-between px-1 mt-1.5 text-[10px] text-slate-500 font-mono">
                  <span>ChatOps commands: `approve`, `reject`, `clear locks`</span>
                  <span>Enter ↵</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
