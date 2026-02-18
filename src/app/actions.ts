'use server';

import { generateMaintenanceResponseDraft, type MaintenanceRequestInput } from '@/ai/flows/automated-maintenance-response-drafts';
import { sendCustomEmail, checkAndSendLeaseReminders } from '@/lib/firebase';
import { logCommunication, getTenant, getWaterReadingsAndTenants, processOverdueNotices, addMaintenanceUpdate } from '@/lib/data';
import { Communication, Landlord, PropertyOwner, WaterMeterReading, MaintenanceRequest } from '@/lib/types';
import { generateArrearsServiceChargeInvoicePDF } from '@/lib/pdf-generator';
import { format } from 'date-fns';


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
    const message = error.message || 'Failed to run automation. Please try again.';
    return { success: false, error: message };
  }
}

export async function getMaintenanceResponseDraft(input: MaintenanceRequestInput) {
  try {
    const result = await generateMaintenanceResponseDraft(input);
    return { success: true, data: result };
  } catch (error: any) {
    const message = error.message || 'Failed to generate AI draft. Please try again.';
    return { success: false, error: message };
  }
}

export async function performRespondToMaintenanceRequest(
    request: MaintenanceRequest,
    message: string,
    authorName: string,
    senderId: string,
    tenantEmail: string
) {
    try {
        const update = {
            message,
            authorName,
            date: new Date().toISOString(),
        };

        await addMaintenanceUpdate(request.id, update);

        // Notify tenant
        const subject = `Update on your Maintenance Request: ${request.title}`;
        const body = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h2 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px;">Maintenance Update</h2>
                <p>Dear Resident,</p>
                <p>An update has been posted regarding your maintenance request for <strong>"${request.title}"</strong>.</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3763eb;">
                    <p style="margin: 0; color: #555;">${message}</p>
                    <p style="margin-top: 10px; font-size: 0.85em; color: #888;">- ${authorName}, Property Management</p>
                </div>
                <p>We are working to resolve this issue as quickly as possible. You can view the full history of this request in your tenant portal.</p>
                <br/>
                <p>Regards,<br/>The Eracov Properties Team</p>
            </div>
        `;

        await performSendCustomEmail(
            [tenantEmail],
            subject,
            body,
            senderId,
            {
                relatedTenantId: request.tenantId,
                type: 'automation',
                subType: 'Maintenance Update',
            }
        );

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to post response.' };
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
        <div style="font-family: sans-serif; max-w: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
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
    return { success: false, error: error.message || 'Failed to send invoice.' };
  }
}

export async function performSendWaterBills(readingIds: string[], senderId: string) {
  try {
    if (readingIds.length === 0) {
      return { success: false, error: 'No bills selected.' };
    }
    
    const billsToSend = await getWaterReadingsAndTenants(readingIds);
    let sentCount = 0;

    for (const { reading, tenant } of billsToSend) {
      if (!tenant?.email) {
        continue;
      }
      
      const subject = `Your Water Bill for ${format(new Date(reading.date), 'MMMM yyyy')}`;
      const body = `
          <div style="font-family: sans-serif; max-w: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333; text-align: center; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Water Bill</h2>
              <p>Dear ${tenant.name},</p>
              <p>Please find your water bill for unit <strong>${reading.unitName}</strong> for the period ending ${format(new Date(reading.date), 'PPP')}.</p>
              <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                  <tr style="background-color: #f0f0f0;"><td style="padding: 10px; border: 1px solid #ddd;">Prior Reading:</td><td style="padding: 10px; border: 1px solid #ddd;">${reading.priorReading} units</td></tr>
                  <tr><td style="padding: 10px; border: 1px solid #ddd;">Current Reading:</td><td style="padding: 10px; border: 1px solid #ddd;">${reading.currentReading} units</td></tr>
                  <tr style="background-color: #f0f0f0;"><td style="padding: 10px; border: 1px solid #ddd;">Consumption:</td><td style="padding: 10px; border: 1px solid #ddd;">${reading.consumption} units</td></tr>
                  <tr><td style="padding: 10px; border: 1px solid #ddd;">Rate:</td><td style="padding: 10px; border: 1px solid #ddd;">Ksh ${reading.rate.toLocaleString()}/unit</td></tr>
                  <tr style="background-color: #f0f0f0; font-weight: bold;"><td style="padding: 12px; border: 1px solid #ddd;">Total Amount Due:</td><td style="padding: 12px; border: 1px solid #ddd;">Ksh ${reading.amount.toLocaleString()}</td></tr>
              </table>
              <p style="margin-top: 25px; font-size: 0.9em; color: #555;">Please make your payment via M-Pesa or Bank Transfer. If you have any questions, please contact us.</p>
              <p style="margin-top: 20px; text-align: center; color: #888; font-size: 0.8em;">Sincerely,<br>The Eracov Properties Team</p>
          </div>
      `;
      
      await performSendCustomEmail(
          [tenant.email],
          subject,
          body,
          senderId,
          {
              relatedTenantId: tenant.id,
              type: 'automation',
              subType: 'Water Bill',
          }
      );
      sentCount++;
    }

    return { success: true, sentCount };
  } catch (error: any) {
    return { success: false, error: error.message || 'An unexpected error occurred while sending bills.' };
  }
}

export async function performProcessMoveOuts(editorId: string) {
    try {
        const { processedCount, errorCount } = await processOverdueNotices(editorId);
        if (errorCount > 0) {
            return { success: false, error: `Processed ${processedCount} notices, but ${errorCount} failed.` };
        }
        if (processedCount === 0) {
            return { success: true, data: { message: 'No overdue move-out notices to process.' } };
        }
        return { success: true, data: { message: `Successfully processed ${processedCount} move-out notices.` } };
    } catch (error: any) {
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}
