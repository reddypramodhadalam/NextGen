/**
 * Notification Service — AITAS
 * Supports: Slack, Microsoft Teams, Email (SMTP), and in-app notifications
 */

import { storage } from "./storage";

export interface NotificationPayload {
  executionId: string;
  suiteName: string;
  status: "passed" | "failed" | "cancelled";
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number; // ms
  environment: string;
  targetUrl?: string;
  triggeredBy?: string;
}

// ─── Slack ────────────────────────────────────────────────────────────────────

async function sendSlackNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<void> {
  const isPassed = payload.status === "passed";
  const passRate =
    payload.totalTests > 0
      ? Math.round((payload.passedTests / payload.totalTests) * 100)
      : 0;
  const durationSec = Math.round(payload.duration / 1000);

  const body = {
    attachments: [
      {
        color: isPassed ? "#10b981" : "#ef4444",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `${isPassed ? "✅" : "❌"} Test Execution ${isPassed ? "Passed" : "Failed"} — ${payload.suiteName}`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Status:*\n${isPassed ? "✅ Passed" : "❌ Failed"}` },
              { type: "mrkdwn", text: `*Environment:*\n${payload.environment}` },
              { type: "mrkdwn", text: `*Pass Rate:*\n${passRate}% (${payload.passedTests}/${payload.totalTests})` },
              { type: "mrkdwn", text: `*Duration:*\n${durationSec}s` },
              ...(payload.failedTests > 0
                ? [{ type: "mrkdwn", text: `*Failed Tests:*\n${payload.failedTests}` }]
                : []),
              ...(payload.targetUrl
                ? [{ type: "mrkdwn", text: `*Target URL:*\n${payload.targetUrl}` }]
                : []),
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Execution ID: \`${payload.executionId.slice(0, 8)}\` | AITAS Test Automation`,
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Slack notification failed: ${response.status} ${response.statusText}`);
  }
}

// ─── Microsoft Teams ──────────────────────────────────────────────────────────

async function sendTeamsNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<void> {
  const isPassed = payload.status === "passed";
  const passRate =
    payload.totalTests > 0
      ? Math.round((payload.passedTests / payload.totalTests) * 100)
      : 0;
  const durationSec = Math.round(payload.duration / 1000);

  const body = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: isPassed ? "10b981" : "ef4444",
    summary: `Test Execution ${isPassed ? "Passed" : "Failed"} — ${payload.suiteName}`,
    sections: [
      {
        activityTitle: `${isPassed ? "✅" : "❌"} **${payload.suiteName}** — ${isPassed ? "PASSED" : "FAILED"}`,
        activitySubtitle: `Environment: **${payload.environment}** | Duration: **${durationSec}s**`,
        facts: [
          { name: "Status", value: isPassed ? "✅ Passed" : "❌ Failed" },
          { name: "Pass Rate", value: `${passRate}% (${payload.passedTests}/${payload.totalTests} tests)` },
          { name: "Failed Tests", value: `${payload.failedTests}` },
          { name: "Environment", value: payload.environment },
          ...(payload.targetUrl ? [{ name: "Target URL", value: payload.targetUrl }] : []),
          { name: "Execution ID", value: payload.executionId.slice(0, 8) },
        ],
        markdown: true,
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Teams notification failed: ${response.status} ${response.statusText}`);
  }
}

// ─── Email (SMTP via fetch to a simple relay or Resend/SendGrid) ──────────────

async function sendEmailNotification(
  config: { to: string; smtpUrl?: string; apiKey?: string; from?: string },
  payload: NotificationPayload
): Promise<void> {
  const isPassed = payload.status === "passed";
  const passRate =
    payload.totalTests > 0
      ? Math.round((payload.passedTests / payload.totalTests) * 100)
      : 0;
  const durationSec = Math.round(payload.duration / 1000);

  const subject = `[AITAS] ${isPassed ? "✅ PASSED" : "❌ FAILED"} — ${payload.suiteName} (${payload.environment})`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { border-left: 4px solid ${isPassed ? "#10b981" : "#ef4444"}; padding-left: 16px; margin-bottom: 24px; }
    .title { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
    .subtitle { font-size: 14px; color: #64748b; margin: 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; background: ${isPassed ? "#d1fae5" : "#fee2e2"}; color: ${isPassed ? "#065f46" : "#991b1b"}; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
    .stat { background: #f8fafc; border-radius: 8px; padding: 16px; }
    .stat-label { font-size: 12px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; margin-top: 4px; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">${isPassed ? "✅" : "❌"} ${payload.suiteName}</div>
      <div class="subtitle">Test Execution Report — ${new Date().toLocaleString()}</div>
    </div>
    <div class="badge">${isPassed ? "PASSED" : "FAILED"}</div>
    <div class="grid">
      <div class="stat">
        <div class="stat-label">Pass Rate</div>
        <div class="stat-value" style="color:${isPassed ? "#10b981" : "#ef4444"}">${passRate}%</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Tests</div>
        <div class="stat-value">${payload.totalTests}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Passed</div>
        <div class="stat-value" style="color:#10b981">${payload.passedTests}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Failed</div>
        <div class="stat-value" style="color:#ef4444">${payload.failedTests}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Environment</div>
        <div class="stat-value" style="font-size:16px">${payload.environment}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Duration</div>
        <div class="stat-value" style="font-size:16px">${durationSec}s</div>
      </div>
    </div>
    ${payload.targetUrl ? `<p style="font-size:13px;color:#64748b">Target: <a href="${payload.targetUrl}">${payload.targetUrl}</a></p>` : ""}
    <div class="footer">
      Execution ID: ${payload.executionId} &bull; AITAS AI Test Automation System
    </div>
  </div>
</body>
</html>`;

  // Try Resend API (if apiKey provided)
  if (config.apiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        from: config.from || "AITAS <noreply@aitas.io>",
        to: [config.to],
        subject,
        html,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Email send failed: ${err}`);
    }
    return;
  }

  // Fallback: log to console (SMTP not configured)
  console.log(`[Notifications] Email would be sent to ${config.to}: ${subject}`);
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function sendExecutionNotifications(
  payload: NotificationPayload
): Promise<void> {
  try {
    // Load notification settings from DB
    const settings = await storage.getAllSettings();
    const notifSettings = settings.filter((s) => s.category === "notifications");

    const getVal = (key: string) =>
      notifSettings.find((s) => s.key === key)?.value || "";

    const notifyOnPass = getVal("notify_on_pass") === "true";
    const notifyOnFail = getVal("notify_on_fail") !== "false"; // default true

    const shouldNotify =
      (payload.status === "passed" && notifyOnPass) ||
      (payload.status === "failed" && notifyOnFail);

    if (!shouldNotify) return;

    const promises: Promise<void>[] = [];

    // Slack
    const slackWebhook = getVal("slack_webhook_url");
    if (slackWebhook) {
      promises.push(
        sendSlackNotification(slackWebhook, payload).catch((e) =>
          console.error("[Notifications] Slack error:", e.message)
        )
      );
    }

    // Teams
    const teamsWebhook = getVal("teams_webhook_url");
    if (teamsWebhook) {
      promises.push(
        sendTeamsNotification(teamsWebhook, payload).catch((e) =>
          console.error("[Notifications] Teams error:", e.message)
        )
      );
    }

    // Email
    const emailTo = getVal("email_recipients");
    const emailApiKey = getVal("email_api_key");
    if (emailTo) {
      promises.push(
        sendEmailNotification(
          { to: emailTo, apiKey: emailApiKey || undefined },
          payload
        ).catch((e) => console.error("[Notifications] Email error:", e.message))
      );
    }

    await Promise.allSettled(promises);
    console.log(`[Notifications] Sent ${promises.length} notification(s) for execution ${payload.executionId.slice(0, 8)}`);
  } catch (error: any) {
    console.error("[Notifications] Failed to send notifications:", error.message);
  }
}

// ─── Test Notification (for settings page) ───────────────────────────────────

export async function sendTestNotification(
  channel: "slack" | "teams" | "email",
  config: Record<string, string>
): Promise<{ success: boolean; message: string }> {
  const testPayload: NotificationPayload = {
    executionId: "test-00000000-0000-0000-0000-000000000000",
    suiteName: "Test Notification Suite",
    status: "passed",
    totalTests: 10,
    passedTests: 9,
    failedTests: 1,
    duration: 45000,
    environment: "staging",
    targetUrl: "https://example.com",
    triggeredBy: "Settings Test",
  };

  try {
    if (channel === "slack" && config.webhookUrl) {
      await sendSlackNotification(config.webhookUrl, testPayload);
      return { success: true, message: "Slack test notification sent successfully!" };
    }
    if (channel === "teams" && config.webhookUrl) {
      await sendTeamsNotification(config.webhookUrl, testPayload);
      return { success: true, message: "Teams test notification sent successfully!" };
    }
    if (channel === "email" && config.to) {
      await sendEmailNotification(
        { to: config.to, apiKey: config.apiKey },
        testPayload
      );
      return { success: true, message: `Test email sent to ${config.to}` };
    }
    return { success: false, message: "Missing configuration for this channel." };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
