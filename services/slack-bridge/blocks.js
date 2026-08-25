const RISK_EMOJI = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function approvalBlocks(approval) {
  const riskEmoji = RISK_EMOJI[approval.riskLevel] || '⚪';
  const commands = Array.isArray(approval.proposedCommands) ? approval.proposedCommands : [];
  const commandsText = commands.length
    ? '```\n' + truncate(commands.join('\n'), 2800) + '\n```'
    : '_No commands proposed_';
  const safetyChecks = Array.isArray(approval.safetyChecks) ? approval.safetyChecks : [];
  const safetyText = safetyChecks.length
    ? safetyChecks.map((c) => `${c.passed ? '✅' : '❌'} ${c.check}`).join('\n')
    : '_None recorded_';

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${riskEmoji} Approval Needed: ${truncate(approval.incidentTitle || approval.incidentId, 140)}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Incident:*\n${approval.incidentId || '—'}` },
        { type: 'mrkdwn', text: `*Target CI:*\n${approval.targetCi || '—'}` },
        { type: 'mrkdwn', text: `*Risk Level:*\n${riskEmoji} ${approval.riskLevel || '—'}` },
        { type: 'mrkdwn', text: `*Confidence:*\n${approval.confidenceScore != null ? Math.round(approval.confidenceScore) + '%' : '—'}` },
        { type: 'mrkdwn', text: `*Department:*\n${approval.department || '—'}` },
        { type: 'mrkdwn', text: `*Agent:*\n${approval.agentName || approval.agentId || '—'}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*Proposed Commands:*\n${commandsText}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Safety Checks:*\n${safetyText}` } },
    ...(approval.aiReasoning
      ? [{ type: 'section', text: { type: 'mrkdwn', text: `*AI Reasoning:*\n${truncate(approval.aiReasoning, 2800)}` } }]
      : []),
    ...(approval.kbTitle
      ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `📚 Matched KB: ${approval.kbTitle}${approval.kbArticleReference ? ` (${approval.kbArticleReference})` : ''}` }] }]
      : []),
    {
      type: 'actions',
      block_id: 'approval_actions',
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: '✅ Approve', emoji: true }, action_id: 'approve_action', value: approval.id },
        { type: 'button', style: 'danger', text: { type: 'plain_text', text: '❌ Reject', emoji: true }, action_id: 'reject_action', value: approval.id },
      ],
    },
  ];
}

function decisionBlocks(approval, decisionText) {
  const blocks = approvalBlocks(approval);
  // Replace the actions block with a static decision line.
  const withoutActions = blocks.filter((b) => b.block_id !== 'approval_actions');
  withoutActions.push({ type: 'context', elements: [{ type: 'mrkdwn', text: decisionText }] });
  return withoutActions;
}

module.exports = { approvalBlocks, decisionBlocks, truncate };
