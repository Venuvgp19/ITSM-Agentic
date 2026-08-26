const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const channel = process.env.SLACK_APPROVALS_CHANNEL;

const blocks = [
  {
    type: 'header',
    text: { type: 'plain_text', text: '🧪 [TEST — NOT A REAL APPROVAL] 🟠 Approval Needed: Sample Incident', emoji: true },
  },
  {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '⚠️ This is a mockup for previewing card layout. It is not tied to any real incident and has no working buttons.' }],
  },
  {
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: '*Incident:*\nINC-TEST-0000' },
      { type: 'mrkdwn', text: '*Target CI:*\nsample-host-01' },
      { type: 'mrkdwn', text: '*Risk Level:*\n🟠 MEDIUM' },
      { type: 'mrkdwn', text: '*Confidence:*\n87%' },
      { type: 'mrkdwn', text: '*Department:*\nSRE' },
      { type: 'mrkdwn', text: '*Agent:*\nsample-agent' },
    ],
  },
  { type: 'section', text: { type: 'mrkdwn', text: '*Proposed Commands:*\n```\nsystemctl restart sample-service\n```' } },
  { type: 'section', text: { type: 'mrkdwn', text: '*Safety Checks:*\n✅ Sample check passed' } },
  { type: 'context', elements: [{ type: 'mrkdwn', text: '🧪 This is a static preview — no Approve/Reject action will do anything.' }] },
];

client.chat.postMessage({
  channel,
  text: '[TEST MOCKUP] Sample approval card preview — not a real approval',
  blocks,
}).then((res) => {
  console.log('Posted test mockup:', res.ts);
}).catch((err) => {
  console.error('Failed to post:', err.message);
});
