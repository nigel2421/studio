
import { generateMaintenanceResponseDraft, type MaintenanceRequestInput } from '@/ai/flows/automated-maintenance-response-drafts';
import { sendCustomEmail, checkAndSendLeaseReminders } from '@/lib/firebase';
import { logCommunication, getTenant } from '@/lib/data';
import { Communication } from '@/lib/types';

export async function performSendCustomEmail(recipients: string[], subject: string, body: string, senderId: string, commDetails: Partial<Omit<Communication, 'id'>> = {}) {
  try {
    const result = await sendCustomEmail({ recipients, subject, body });

    // Log the communication after successful sending
    const htmlBody = body.replace(/\n/g, '<br>');
    await logCommunication({
        senderId,
        subject,
        body: htmlBody,
        recipients,
        recipientCount: recipients.length,
        type: 'announcement',
        status: 'sent',
        timestamp: new Date().toISOString(),
        ...commDetails,
    });

    return { success: true, data: result.data };
  } catch (error: any) {
    console.error("Error sending custom email:", error);
    // Also log a failed communication attempt
     await logCommunication({
        senderId,
        subject,
        body: body.replace(/\n/g, '<br>'),
        recipients,
        recipientCount: recipients.length,
        type: 'announcement',
        status: 'failed',
        timestamp: new Date().toISOString(),
        ...commDetails,
    });
    const message = error.message || 'Failed to send email. Please check the system logs.';
    return { success: false, error: message };
  }
}

export async function performCheckLeaseReminders() {
  try {
    const result = await checkAndSendLeaseReminders();
    return { success: true, data: result.data };
  } catch (error: any) {
    console.error("Error checking lease reminders:", error);
    const message = error.message || 'Failed to run automation. Please try again.';
    return { success: false, error: message };
  }
}

export async function getMaintenanceResponseDraft(input: MaintenanceRequestInput) {
  try {
    const result = await generateMaintenanceResponseDraft(input);
    return { success: true, data: result };
  } catch (error: any) {
    console.error(error);
    const message = error.message || 'Failed to generate AI draft. Please try again.';
    return { success: false, error: message };
  }
}

export async function performSendArrearsReminder(tenantId: string, senderId: string) {
  try {
    const tenant = await getTenant(tenantId);
    if (!tenant) {
      return { success: false, error: 'Tenant not found.' };
    }

    if (!tenant.dueBalance || tenant.dueBalance <= 0) {
      return { success: false, error: 'This resident has no outstanding balance.' };
    }

    const subject = 'Friendly Reminder: Outstanding Account Balance';
    const body = `Dear ${tenant.name},\n\nThis is a friendly reminder regarding your account. Your current outstanding balance is Ksh ${tenant.dueBalance.toLocaleString()}.\n\nPlease make a payment at your earliest convenience to clear your balance.\n\nThank you,\nEracov Properties`;
    
    const result = await performSendCustomEmail(
      [tenant.email],
      subject,
      body,
      senderId,
      {
        relatedTenantId: tenant.id,
        type: 'automation',
        subType: 'Arrears Reminder',
      }
    );

    if (result.success) {
        return { success: true, message: `Reminder sent to ${tenant.name}` };
    } else {
        return { success: false, error: result.error };
    }

  } catch (error: any) {
    console.error("Error sending arrears reminder:", error);
    const message = error.message || 'Failed to send reminder.';
    return { success: false, error: message };
  }
}
