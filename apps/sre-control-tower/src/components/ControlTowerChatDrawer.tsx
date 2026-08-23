import React, { useState } from 'react';
import { MessageSquare, Send, Bot, User, X, ShieldAlert, Terminal, CheckCircle2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  type?: 'text' | 'telemetry' | 'approval_prompt';
  metadata?: any;
}

export const ControlTowerChatDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'bot',
      text: "👋 Welcome to **Agentic Control Tower AI Co-Pilot**. How can I assist with SRE telemetry, safety guardrail audits, or incident approvals?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    setTimeout(() => {
      let botResponseText = "🔍 Telemetry probe executed successfully across target infrastructure.";
      const query = inputText.toLowerCase();

      if (query.includes("control plane") || query.includes("kubernetes")) {
        botResponseText = `📊 **Control Plane Health Probe (192.168.100.101)**\n\n- **Status**: [HEALTHY ✅]\n- **Kubelet**: Active (running)\n- **API Server Watch Events**: 14,200/min (Normal range)\n- **Active Incidents**: None locked.\n\nType \`inspect AC-884\` for approval details.`;
      } else if (query.includes("worker") || query.includes("memory")) {
        botResponseText = `💻 **Worker Node 1 Telemetry (192.168.56.10)**\n\n- **RAM Usage**: 43.1% (3.4 GB / 7.9 GB)\n- **Containerd**: Active (running)\n- **Swap**: 0% (Clean)\n\nNo memory pressure or OOM conditions detected.`;
      } else if (query.includes("servicenow") || query.includes("ticket")) {
        botResponseText = `🔄 **ServiceNow Connector Status**\n\n- **Provider**: ServiceNow Table API Gateway\n- **Outbound Webhook Listener**: Active on \`POST /api/v1/servicenow/webhook\`\n- **Last Sync**: 10 seconds ago (0 pending webhooks)`;
      } else {
        botResponseText = `🛡️ **Control Tower Safety Guard Report**\n\n- **Loop-Aware Validator**: Active\n- **Proof-of-Fix Guard**: Active\n- All terminal commands in approved runbooks are verified for syntax safety.`;
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: botResponseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'telemetry'
      };

      setMessages(prev => [...prev, botMsg]);
      setIsProcessing(false);
    }, 800);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col font-sans">
      {/* Header */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Control Tower AI Co-Pilot</h3>
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> SRE Governance Active
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
              msg.sender === 'user'
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none font-mono whitespace-pre-wrap'
            }`}>
              {msg.text}
              <div className={`text-[10px] mt-1 ${msg.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'} text-right`}>
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-mono">
            <Bot className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Analyzing SRE telemetry...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Ask AI Co-Pilot (e.g. Check worker memory...)"
            className="flex-1 bg-slate-900 text-slate-100 placeholder-slate-500 text-xs rounded-lg border border-slate-800 px-3 py-2 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
