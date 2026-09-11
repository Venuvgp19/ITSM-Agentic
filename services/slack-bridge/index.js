process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { App } = require('@slack/bolt');
const store = require('./store');
const { approvalBlocks, decisionBlocks, truncate } = require('./blocks');

const CONTROL_TOWER_URL = process.env.CONTROL_TOWER_URL || 'http://localhost:5173';
const APPROVALS_CHANNEL = process.env.SLACK_APPROVALS_CHANNEL;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '15000', 10);

for (const required of ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_APPROVALS_CHANNEL']) {
  if (!process.env[required]) {
    console.error(`Missing required env var: ${required}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

app.error((err) => {
  console.error('[slack-bridge] Bolt error:', err.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('[slack-bridge] Uncaught exception (swallowed to keep socket alive):', err.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[slack-bridge] Unhandled rejection:', reason);
});

async function ctFetch(pathname, options = {}) {
  const res = await fetch(`${CONTROL_TOWER_URL}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${pathname} -> ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// 1. Poll for new pending approvals and post them as Slack approval cards.
// ---------------------------------------------------------------------------
async function pollApprovals() {
  try {
    const approvals = await ctFetch('/api/v1/agent/approvals?status=pending');
    for (const approval of approvals) {
      if (store.has(approval.id)) continue; // already posted
      const result = await app.client.chat.postMessage({
        channel: APPROVALS_CHANNEL,
        text: `Approval needed: ${approval.incidentTitle || approval.incidentId}`,
        blocks: approvalBlocks(approval),
      });
      store.set(approval.id, { channel: result.channel, ts: result.ts, status: 'PENDING', approval });
      console.log(`[slack-bridge] Posted approval card for ${approval.id}`);
    }
  } catch (err) {
    console.error('[slack-bridge] pollApprovals error:', err.message);
  }
}
setInterval(pollApprovals, POLL_INTERVAL_MS);
pollApprovals();

// ---------------------------------------------------------------------------
// 2. Approve button
// ---------------------------------------------------------------------------
app.action('approve_action', async ({ ack, body, client }) => {
  await ack();
  const approvalId = body.actions[0].value;
  const entry = store.get(approvalId);
  const approverName = body.user?.name || body.user?.id || 'slack-user';
  try {
    await ctFetch(`/api/v1/agent/approvals/${approvalId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approverName }),
    });
    store.set(approvalId, { status: 'APPROVED' });
    if (entry) {
      await client.chat.update({
        channel: entry.channel,
        ts: entry.ts,
        text: `Approved by ${approverName}`,
        blocks: decisionBlocks(entry.approval, `✅ *Approved* by <@${body.user.id}>`),
      });
    }
  } catch (err) {
    console.error('[slack-bridge] approve error:', err.message);
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `Failed to approve: ${err.message}`,
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Reject button -> opens a modal to collect a reason
// ---------------------------------------------------------------------------
app.action('reject_action', async ({ ack, body, client }) => {
  await ack();
  const approvalId = body.actions[0].value;
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'reject_modal_submit',
      private_metadata: JSON.stringify({ approvalId, channel: body.channel.id, messageTs: body.message.ts }),
      title: { type: 'plain_text', text: 'Reject Approval' },
      submit: { type: 'plain_text', text: 'Reject' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'reason_block',
          label: { type: 'plain_text', text: 'Reason for rejection' },
          element: { type: 'plain_text_input', action_id: 'reason_input', multiline: true },
        },
      ],
    },
  });
});

app.view('reject_modal_submit', async ({ ack, body, view, client }) => {
  await ack();
  const { approvalId, channel, messageTs } = JSON.parse(view.private_metadata);
  const rejectionReason = view.state.values.reason_block.reason_input.value;
  const rejectorName = body.user?.name || body.user?.id || 'slack-user';
  const entry = store.get(approvalId);
  try {
    await ctFetch(`/api/v1/agent/approvals/${approvalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason, rejectorName }),
    });
    store.set(approvalId, { status: 'REJECTED' });
    if (entry) {
      await client.chat.update({
        channel,
        ts: messageTs,
        text: `Rejected by ${rejectorName}`,
        blocks: decisionBlocks(entry.approval, `❌ *Rejected* by <@${body.user.id}>: ${truncate(rejectionReason, 500)}`),
      });
    }
  } catch (err) {
    console.error('[slack-bridge] reject error:', err.message);
  }
});

// ---------------------------------------------------------------------------
// 4. ITSM/SRE Q&A — @mentions and DMs proxy to the read-only SRE Assistant.
// Streams from /api/v1/agent/chat/stream (SSE) and progressively edits the
// same Slack message as tokens arrive, instead of waiting silently for the
// full response then posting it once.
// ---------------------------------------------------------------------------
async function streamChat(question, onEvent) {
  const res = await fetch(`${CONTROL_TOWER_URL}/api/v1/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST /api/v1/agent/chat/stream -> ${res.status}: ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        let eventName = 'message';
        let dataStr = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr += line.slice(6);
        }
        if (!dataStr) continue;
        let data;
        try { data = JSON.parse(dataStr); } catch { continue; }
        await onEvent(eventName, data);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

async function answerQuestion({ text, channel, thread_ts, say }) {
  const question = text.trim();
  if (!question) return;

  const initial = await say({ text: '🤔 Thinking…', channel, thread_ts });
  let accumulated = '';
  let lastUpdateAt = 0;
  const UPDATE_INTERVAL_MS = 1000;

  const updateMessage = async (displayText, force = false) => {
    const now = Date.now();
    if (!force && now - lastUpdateAt < UPDATE_INTERVAL_MS) return;
    lastUpdateAt = now;
    try {
      await app.client.chat.update({ channel: initial.channel, ts: initial.ts, text: truncate(displayText, 3900) });
    } catch (err) {
      console.error('[slack-bridge] chat.update error:', err.message);
    }
  };

  try {
    await streamChat(question, async (eventName, data) => {
      if (eventName === 'token' && data.delta) {
        accumulated += data.delta;
        await updateMessage(`${accumulated} ▌`);
      } else if (eventName === 'checkpoint' && data.message) {
        await updateMessage(`🤔 ${data.message}`, true);
      } else if (eventName === 'error') {
        throw new Error(data.error || 'Unknown error from SRE Assistant');
      }
      // tool_start / tool_done fire per DB query the assistant runs -- not
      // surfaced to Slack, only the accumulating answer text is.
    });
    const finalText = accumulated.trim() || 'Sorry, I could not generate a response.';
    await updateMessage(finalText, true);
  } catch (err) {
    console.error('[slack-bridge] chat error:', err.message);
    await updateMessage(`⚠️ Failed to reach the SRE Assistant: ${err.message}`, true);
  }
}

app.event('app_mention', async ({ event, say }) => {
  const question = event.text.replace(/<@[^>]+>/g, '').trim();
  await answerQuestion({ text: question, channel: event.channel, thread_ts: event.thread_ts || event.ts, say });
});

app.event('message', async ({ event, say }) => {
  // Only handle plain DMs to the bot (channel_type 'im'), ignore bot's own messages / edits / channel chatter.
  if (event.channel_type !== 'im' || event.subtype || event.bot_id) return;
  await answerQuestion({ text: event.text, channel: event.channel, thread_ts: undefined, say });
});

(async () => {
  await app.start();
  console.log('[slack-bridge] ⚡️ Slack bridge running (Socket Mode)');
  console.log(`[slack-bridge] Posting approvals to channel ${APPROVALS_CHANNEL}, polling ${CONTROL_TOWER_URL} every ${POLL_INTERVAL_MS}ms`);
})();
