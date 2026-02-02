import { generateMaintenanceResponseDraft, type MaintenanceRequestInput } from '@/ai/flows/automated-maintenance-response-drafts';
import { sendCustomEmail, checkAndSendLeaseReminders } from '@/lib/firebase';
import { logCommunication, getTenant } from '@/lib/data';
import { Communication, Landlord, PropertyOwner } from '@/lib/types';
import { generateArrearsServiceChargeInvoicePDF } from '@/lib/pdf-generator';


export async function performSendCustomEmail(
    recipients: string[],
    subject: string,
    body: string,
    senderId: string,
    commDetails: Partial<Omit<Communication, 'id'>> = {},
    attachment?: { content: string; filename: string }
) {
  try {
    const result = await sendCustomEmail({ recipients, subject, body, attachment });

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
  invoiceDetails: InvoiceDetails,
  owner: PropertyOwner | Landlord
) {
  try {
    if (!ownerEmail) {
        throw new Error("Owner does not have a registered email address.");
    }

    const pdfBase64 = generateArrearsServiceChargeInvoicePDF(owner, invoiceDetails);

    const subject = `Service Charge Invoice: ${invoiceDetails.month}`;
    const body = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
            <p>Dear ${ownerName},</p>
            <p>Please find your service charge invoice for your outstanding balance attached to this email.</p>
            <p>A summary of the invoice is below:</p>
            <ul>
                ${invoiceDetails.items.map(item => `<li>${item.description}: Ksh ${item.amount.toLocaleString()}</li>`).join('')}
            </ul>
            <p><b>Total Amount Due: Ksh ${invoiceDetails.totalDue.toLocaleString()}</b></p>
            <br/>
            <p>Thank you,<br/>The Eracov Properties Team</p>
        </div>
    `;

    const commDetails = {
        type: 'automation' as const,
        subType: 'Service Charge Invoice',
    };
    
    const attachment = {
        content: pdfBase64,
        filename: `invoice_${ownerName.replace(/ /g, '_')}_${invoiceDetails.month.replace(/ /g, '_')}.pdf`
    };

    return await performSendCustomEmail([ownerEmail], subject, body, 'system', commDetails, attachment);

  } catch (error: any) {
    console.error("Error sending service charge invoice:", error);
    return { success: false, error: error.message || 'Failed to send invoice.' };
  }
}
