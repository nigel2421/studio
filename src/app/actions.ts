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

interface InvoiceDetails {
    month: string;
    items: { description: string; amount: number }[];
    totalDue: number;
}

export async function performSendServiceChargeInvoice(
  ownerId: string,
  ownerEmail: string,
  ownerName: string,
  invoiceDetails: InvoiceDetails
) {
  try {
    if (!ownerEmail) {
        throw new Error("Owner does not have a registered email address.");
    }
    const subject = `Service Charge Invoice for ${invoiceDetails.month}`;
    const itemsHtml = invoiceDetails.items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">Ksh ${item.amount.toLocaleString()}</td>
      </tr>
    `).join('');

    const body = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
            <p>Dear ${ownerName},</p>
            <p>Please find your service charge invoice for ${invoiceDetails.month}.</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="padding: 12px; border-bottom: 2px solid #ddd; text-align: left;">Description</th>
                        <th style="padding: 12px; border-bottom: 2px solid #ddd; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
                <tfoot>
                    <tr style="font-weight: bold; background-color: #f2f2f2;">
                        <td style="padding: 12px; border-top: 2px solid #ddd; text-align: right;">Total Amount Due</td>
                        <td style="padding: 12px; border-top: 2px solid #ddd; text-align: right;">Ksh ${invoiceDetails.totalDue.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
            <p style="margin-top: 25px;">Please remit payment at your earliest convenience.</p>
            <br/>
            <p>Thank you,<br/>The Eracov Properties Team</p>
        </div>
    `;

    const commDetails = {
        type: 'automation' as const,
        subType: 'Service Charge Invoice',
    };

    return await performSendCustomEmail([ownerEmail], subject, body, 'system', commDetails);

  } catch (error: any) {
    console.error("Error sending service charge invoice:", error);
    return { success: false, error: error.message || 'Failed to send invoice.' };
  }
}
