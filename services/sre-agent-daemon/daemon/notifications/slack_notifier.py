"""
One-off Slack alerting for the Agentic AI Router.

Deliberately separate from services/slack-bridge (which owns the interactive
HITL approval cards/buttons) -- this only ever fires plain text alerts.
"""

import threading
import requests

from ..config import logger, SLACK_BOT_TOKEN, ROUTER_FAILURE_SLACK_CHANNEL

_lock = threading.Lock()
_failure_already_notified = False


def notify_router_failure(number, reason):
    """
    Posts a one-time "AI Router failed to route" alert to
    ROUTER_FAILURE_SLACK_CHANNEL. Gated so a continuous run of failures (e.g.
    the LLM endpoint being down) posts exactly one alert instead of spamming
    the channel every 15s poll cycle -- call reset_router_failure_notice()
    once routing succeeds again so a *future* failure can re-alert.
    """
    global _failure_already_notified
    if not SLACK_BOT_TOKEN:
        logger.warning("AI Router failure alert: SLACK_BOT_TOKEN not set in environment, skipping Slack post.")
        return
    with _lock:
        if _failure_already_notified:
            return
        _failure_already_notified = True

    text = (
        f"🚨 *Agentic AI Router — Routing Failure*\n"
        f"Failed to route incident *{number}*.\n"
        f"Reason: {reason}"
    )
    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}"},
            json={"channel": ROUTER_FAILURE_SLACK_CHANNEL, "text": text},
            timeout=5,
            verify=False,
        )
        data = resp.json()
        if not data.get("ok"):
            logger.warning(f"AI Router failure alert: Slack rejected post: {data.get('error')}")
        else:
            logger.info(f"📣 [Agentic AI Router] Posted routing-failure alert to Slack for [{number}]")
    except Exception as e:
        logger.warning(f"AI Router failure alert: could not reach Slack: {e}")


def reset_router_failure_notice():
    """Re-arms the one-time alert gate after a successful routing pass."""
    global _failure_already_notified
    with _lock:
        _failure_already_notified = False
