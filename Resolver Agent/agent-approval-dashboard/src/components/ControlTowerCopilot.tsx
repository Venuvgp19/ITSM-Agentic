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
  Activity
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
      content: `👋 **Welcome to Control Tower SRE Copilot**\n\nI am your live ChatOps & AI Governance Assistant. I monitor pending human approvals, agent execution loops, and cluster health.\n\nHow can I assist your operations today?`,
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

      // If an action was executed, refresh the main dashboard
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

  // Modern Structured Message Renderer
  const renderMessageContent = (content: string, msgId: string) => {
    // Split into code blocks vs text blocks
    const segments = content.split(/(```[\s\S]*?```)/g);

    return (
      <div className="space-y-2.5 text-[13px] leading-relaxed text-slate-200 font-sans antialiased">
        {segments.map((segment, segIdx) => {
          // 1. Code Block
          if (segment.startsWith('```')) {
            const lines = segment.slice(3, -3).trim().split('\n');
            const lang = lines[0]?.match(/^[a-z]+/i) ? lines[0] : '';
            const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
            const codeBlockId = `${msgId}_code_${segIdx}`;

            return (
              <div
                key={segIdx}
                className="my-3 rounded-xl overflow-hidden border border-slate-700/70 bg-[#090d16] shadow-md"
              >
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5 text-indigo-300 font-medium">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    {lang || 'bash'}
                  </span>
                  <button
                    onClick={() => handleCopyCode(code, codeBlockId)}
                    className="flex items-center gap-1 hover:text-white transition-colors text-slate-400 hover:bg-slate-800 px-2 py-0.5 rounded"
                    title="Copy code"
                  >
                    {copiedCodeId === codeBlockId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 text-[11px] font-sans">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-sans">Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 text-xs font-mono text-emerald-300/95 overflow-x-auto whitespace-pre leading-5">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          // 2. Normal text & Markdown elements
          const rawLines = segment.split('\n');
          return (
            <div key={segIdx} className="space-y-2">
              {rawLines.map((line, lIdx) => {
                const trimmed = line.trim();
                if (!trimmed) return null;

                // Headers (e.g. ### [APPR-2650] Title)
                if (trimmed.startsWith('### ')) {
                  const headerText = trimmed.substring(4);
                  const apprMatch = headerText.match(/\[(APPR-\d+)\]/i);
                  const isDestructive = headerText.includes('DESTRUCTIVE') || headerText.includes('CRITICAL');

                  return (
                    <div
                      key={lIdx}
                      className="mt-4 mb-2 p-2.5 rounded-xl bg-slate-900/90 border border-indigo-500/20 flex flex-col gap-1.5 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        {apprMatch && (
                          <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {apprMatch[1]}
                          </span>
                        )}
                        {isDestructive && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-rose-400" />
                            Approval Required
                          </span>
                        )}
                      </div>
                      <h4 className="text-[13px] font-semibold text-slate-100 leading-snug">
                        {headerText.replace(/\[APPR-\d+\]\s*/i, '').replace(/\[DESTRUCTIVE COMMAND APPROVAL REQUIRED\]\s*/i, '')}
                      </h4>
                    </div>
                  );
                }

                // Sub-headers or Main Titles (e.g. ## Title or ? **Title**)
                if (trimmed.startsWith('## ') || (trimmed.startsWith('**') && trimmed.endsWith('**'))) {
                  const cleanTitle = trimmed.replace(/^##\s*/, '').replace(/\*\*/g, '').replace(/^[^\w\s]+/, '').trim();
                  return (
                    <h3 key={lIdx} className="text-sm font-bold text-indigo-200 mt-2 mb-1 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{cleanTitle}</span>
                    </h3>
                  );
                }

                // Bullet Point rows (- **Key**: Value)
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                  const itemContent = trimmed.substring(2);

                  // Extract Key-Value pairs like **Target Host / CI**: `value`
                  const kvMatch = itemContent.match(/^\*\*(.*?)\*\*:\s*(.*)$/);
                  if (kvMatch) {
                    const key = kvMatch[1].trim();
                    const value = kvMatch[2].trim();

                    // Style risk badges
                    let valueBadge = null;
                    if (value.includes('CRITICAL') || value.includes('DESTRUCTIVE')) {
                      valueBadge = (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                          {value}
                        </span>
                      );
                    } else if (value.includes('HIGH')) {
                      valueBadge = (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                          {value}
                        </span>
                      );
                    } else if (value.startsWith('`') && value.endsWith('`')) {
                      valueBadge = (
                        <code className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-300 font-mono text-xs">
                          {value.slice(1, -1)}
                        </code>
                      );
                    }

                    return (
                      <div key={lIdx} className="flex items-baseline gap-2 py-0.5 text-xs text-slate-300">
                        <span className="text-indigo-400 font-bold">•</span>
                        <span className="font-semibold text-slate-100 min-w-[110px] shrink-0">{key}:</span>
                        <span className="text-slate-300 flex-1">{valueBadge || <span dangerouslySetInnerHTML={{ __html: value.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />}</span>
                      </div>
                    );
                  }

                  // Normal bullet point
                  const formatted = itemContent
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-300 font-mono text-xs">$1</code>');

                  return (
                    <div
                      key={lIdx}
                      className="flex items-start gap-2 py-0.5 text-xs text-slate-300"
                    >
                      <span className="text-indigo-400 font-bold shrink-0">•</span>
                      <span className="leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />
                    </div>
                  );
                }

                // Paragraph Text
                const formatted = trimmed
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                  .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-300 font-mono text-xs">$1</code>');

                return (
                  <p
                    key={lIdx}
                    className="text-xs text-slate-300 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatted }}
                  />
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
            className="group relative flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all duration-300 border border-indigo-400/40 font-medium text-xs tracking-wide"
          >
            <div className="relative">
              <Bot className="w-5 h-5 text-indigo-100" />
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <span className="font-semibold">Control Tower Copilot</span>

            {pendingApprovals.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-400 text-slate-950 rounded-full shadow-sm">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Floating Copilot Drawer Window */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 transition-all duration-300 flex flex-col bg-[#0b0f19] border border-indigo-500/30 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden font-sans ${
            isMinimized
              ? 'w-80 h-14'
              : 'w-[480px] max-w-[calc(100vw-2rem)] h-[640px] max-h-[calc(100vh-4rem)]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#121829] via-[#0f1422] to-[#121829] border-b border-indigo-500/20 select-none">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
                <Bot className="w-4 h-4" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-slate-900" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white tracking-wide">SRE AI Copilot</h3>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Llama 3.3
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Autonomous Governance & ChatOps</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1 text-slate-400">
              <button
                onClick={handleClearHistory}
                className="p-1 rounded-md hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Clear Chat History"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 rounded-md hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md hover:bg-rose-900/40 hover:text-rose-300 transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Context Telemetry Bar */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-[#070a12] border-b border-slate-800/80 text-[10px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  Pending: <strong className="text-white">{pendingApprovals.length}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  Mode: <strong className="text-emerald-400">Continuous HITL</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-indigo-400" />
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
                      className={`max-w-[92%] rounded-2xl p-3.5 shadow-md ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none border border-indigo-400/30 text-xs font-medium'
                          : 'bg-[#121826] text-slate-200 rounded-bl-none border border-slate-800 shadow-slate-950/60'
                      }`}
                    >
                      {renderMessageContent(msg.content, msg.id)}

                      {/* Action Applied Notice */}
                      {msg.actionExecuted && (
                        <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-bold text-emerald-400 text-[11px]">
                            <Check className="w-3.5 h-3.5" /> Action Applied: {msg.actionExecuted.type}
                          </span>
                          <button
                            onClick={onRefreshNeeded}
                            className="text-[10px] text-indigo-300 hover:text-white flex items-center gap-1 underline underline-offset-2"
                          >
                            <RotateCcw className="w-3 h-3" /> Refresh UI
                          </button>
                        </div>
                      )}
                    </div>

                    <span className="text-[9px] text-slate-500 mt-1 px-1 font-mono">
                      {msg.timestamp}
                    </span>

                    {/* Quick Follow-Up Pills */}
                    {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 max-w-[92%]">
                        {msg.suggestedFollowUps.map((prompt, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => handleSendMessage(prompt)}
                            className="text-[10px] px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-indigo-950 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-400 transition-all flex items-center gap-1 shadow-sm active:scale-95 text-left font-medium"
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
                  <div className="flex items-start gap-2">
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-indigo-300">
                      <Cpu className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span>Copilot is analyzing telemetry & ground truth...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 bg-[#070a12] border-t border-slate-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2 bg-[#0e1320] rounded-xl border border-slate-700/80 px-3 py-1 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask Copilot (e.g. 'Approve APPR-1818', 'Show MTTR')..."
                    className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none py-1.5 font-sans"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isLoading}
                    className="p-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-500 active:scale-95 transition-all shadow-sm"
                    title="Send"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
                <div className="flex items-center justify-between px-1 mt-1 text-[9px] text-slate-500 font-mono">
                  <span>ChatOps: `approve`, `reject`, `clear locks`</span>
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
