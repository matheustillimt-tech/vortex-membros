import { getDb } from "@/db";
import { EmailsBoard } from "@/components/dashboard/emails-board";
import { emailHealthNotice } from "@/lib/email/health";
import { getOutboxHealth } from "@/lib/email/outbox";
import { getPlatformSettings } from "@/lib/settings";
import { getAdmin } from "../../data";

export const metadata = { title: "E-mails" };

export default async function EmailsSettingsPage() {
  await getAdmin();
  const db = getDb();
  const [settings, health] = await Promise.all([getPlatformSettings(db), getOutboxHealth(db)]);
  return (
    <EmailsBoard
      emails={settings.emails}
      senderEmail={process.env.EMAIL_FROM_EMAIL?.trim() || settings.emails.replyTo}
      notice={emailHealthNotice(health)}
    />
  );
}
