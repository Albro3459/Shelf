'use node';

import { SESv2Client, SESv2ServiceException, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { buildAvailabilityEmail } from './emailTemplate';

type EmailResult =
  | { status: 'submitted'; messageId: string }
  | { status: 'failed' | 'uncertain'; errorCode: string };

export const send = internalAction({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, { notificationId }): Promise<void> => {
    const message = await ctx.runMutation(internal.notifications.claim, { notificationId });
    if (!message) return;
    const env = (globalThis as typeof globalThis & { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    let result: EmailResult;
    if (!env.AWS_REGION || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.SES_FROM_EMAIL || !env.SITE_URL) {
      result = { status: 'failed', errorCode: 'email-configuration-missing' };
    } else {
      const client = new SESv2Client({
        region: env.AWS_REGION, maxAttempts: 1,
        credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const listsUrl = new URL(env.SITE_URL);
        listsUrl.hash = 'view=lists';
        const body = buildAvailabilityEmail({ ...message, listsUrl: listsUrl.href });
        const response = await client.send(new SendEmailCommand({
          FromEmailAddress: env.SES_FROM_EMAIL,
          Destination: { ToAddresses: [message.recipient] },
          Content: { Simple: {
            Subject: { Data: `Available: ${message.title.slice(0, 160)}`, Charset: 'UTF-8' },
            Body: {
              Text: { Data: body.text, Charset: 'UTF-8' },
              Html: { Data: body.html, Charset: 'UTF-8' },
            },
          } },
        }), { abortSignal: controller.signal });
        result = response.MessageId ? { status: 'submitted', messageId: response.MessageId } : { status: 'uncertain', errorCode: 'missing-provider-message-id' };
      } catch (error) {
        const knownRejection = error instanceof SESv2ServiceException && error.$metadata.httpStatusCode != null && error.$metadata.httpStatusCode < 500;
        result = knownRejection ? { status: 'failed', errorCode: error.name } : { status: 'uncertain', errorCode: 'provider-outcome-unknown' };
      } finally {
        clearTimeout(timer);
        client.destroy();
      }
    }
    await ctx.runMutation(internal.notifications.finish, { notificationId, attempt: message.attempt, result });
  },
});
