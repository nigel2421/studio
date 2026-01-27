
/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";
import {defineString} from "firebase-functions/params";
import * as admin from "firebase-admin";
import { format } from "date-fns";

admin.initializeApp();
const db = admin.firestore();


// Define environment variables for email configuration
const emailHost = defineString("EMAIL_HOST");
const emailPort = defineString("EMAIL_PORT");
const emailUser = defineString("EMAIL_USER");
const emailPass = defineString("EMAIL_PASS");

setGlobalOptions({ 
    maxInstances: 10,
    secrets: ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS"],
});

// A function to create and configure the email transporter
const createTransporter = () => {
    const port = parseInt(process.env.EMAIL_PORT || emailPort.value(), 10);
    if (isNaN(port)) {
        // This is a server-side configuration error, so we throw to fail fast.
        throw new Error(`Invalid EMAIL_PORT value: "${process.env.EMAIL_PORT}". It must be a number.`);
    }
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || emailHost.value(),
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER || emailUser.value(),
            pass: process.env.EMAIL_PASS || emailPass.value(),
        },
    });
};

// Callable function to send a payment receipt
export const sendPaymentReceipt = onCall({
    secrets: ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS"],
}, async (request) => {
    const { tenantEmail, tenantName, amount, date, propertyName, unitName, notes, tenantId } = request.data;

    // Validate essential data
    if (!tenantEmail || !tenantName || !amount || !date || !propertyName || !unitName) {
        throw new HttpsError('invalid-argument', 'Missing required data for sending a receipt.');
    }

    const transporter = createTransporter();

    const mailOptions = {
        from: `"Eracov Properties" <${process.env.EMAIL_USER || emailUser.value()}>`,
        to: tenantEmail,
        subject: "Your Payment Receipt",
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h2 style="color: #333; text-align: center; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Payment Received</h2>
                <p>Dear ${tenantName},</p>
                <p>We have successfully received your payment. Thank you!</p>
                <h3 style="color: #333; border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">Receipt Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background-color: #f9f9f9;"><td style="padding: 10px; border: 1px solid #ddd;">Amount Paid:</td><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Ksh ${amount.toLocaleString()}</td></tr>
                    <tr><td style="padding: 10px; border: 1px solid #ddd;">Payment Date:</td><td style="padding: 10px; border: 1px solid #ddd;">${date}</td></tr>
                    <tr style="background-color: #f9f9f9;"><td style="padding: 10px; border: 1px solid #ddd;">Property:</td><td style="padding: 10px; border: 1px solid #ddd;">${propertyName}</td></tr>
                    <tr><td style="padding: 10px; border: 1px solid #ddd;">Unit:</td><td style="padding: 10px; border: 1px solid #ddd;">${unitName}</td></tr>
                    ${notes ? `<tr style="background-color: #f9f9f9;"><td style="padding: 10px; border: 1px solid #ddd;">Notes:</td><td style="padding: 10px; border: 1px solid #ddd;">${notes}</td></tr>` : ''}
                </table>
                <p style="margin-top: 25px; font-size: 0.9em; color: #555;">If you have any questions about this payment, please don't hesitate to contact us.</p>
                <p style="margin-top: 20px; text-align: center; color: #888; font-size: 0.8em;">Sincerely,<br>The Eracov Properties Team</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`Receipt sent to ${tenantEmail}`);

        if (tenantId) {
             await db.collection('communications').add({
                recipients: [tenantEmail],
                recipientCount: 1,
                relatedTenantId: tenantId,
                type: 'automation',
                subType: 'Payment Receipt',
                subject: "Your Payment Receipt",
                body: mailOptions.html,
                senderId: 'system',
                timestamp: new Date().toISOString(),
                status: 'sent',
            });
        }

        return { success: true, message: "Receipt sent successfully." };
    } catch (error) {
        logger.error("Error sending email:", error);
        // Throw a specific error for the client
        throw new HttpsError("internal", "Failed to send email. This is likely due to missing or incorrect SMTP credentials in your Firebase project's environment configuration. Please ensure EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS secrets are set correctly.");
    }
});

// Callable function to send a custom email announcement
export const sendCustomEmail = onCall({
    secrets: ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS"],
}, async (request) => {
    const { recipients, subject, body } = request.data;

    // Validate essential data
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !subject || !body) {
        logger.error("Missing required data for sending custom emails.", request.data);
        throw new HttpsError('invalid-argument', 'Missing recipients, subject, or message body.');
    }

    const transporter = createTransporter();

    const sendPromises = recipients.map(email => {
        const mailOptions = {
            from: `"Eracov Properties" <${process.env.EMAIL_USER || emailUser.value()}>`,
            to: email,
            subject: subject,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                    <div style="text-align: center; border-bottom: 2px solid #f97316; padding-bottom: 15px; margin-bottom: 20px;">
                        <h1 style="color: #333; margin: 0; font-size: 24px;">Eracov Properties</h1>
                    </div>
                    <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">${subject}</h2>
                    <div style="line-height: 1.6; color: #444; font-size: 16px;">
                        ${body.replace(/\n/g, '<br>')}
                    </div>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 0.8em; color: #888; text-align: center;">
                        <p>You are receiving this email as a resident of an Eracov Properties managed development.</p>
                        <p>Sincerely,<br>Management Team</p>
                    </div>
                </div>
            `,
        };
        return transporter.sendMail(mailOptions);
    });

    try {
        await Promise.all(sendPromises);
        logger.info(`Custom email "${subject}" sent to ${recipients.length} recipients.`);
        return { success: true, message: `Email sent successfully to ${recipients.length} recipients.` };
    } catch (error) {
        logger.error("Error sending bulk email:", error);
        throw new HttpsError("internal", "Failed to send email. This is likely due to missing or incorrect SMTP credentials in your Firebase project's environment configuration. Please ensure EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS secrets are set correctly.");
    }
});


export const checkAndSendLeaseReminders = onCall({
    secrets: ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS"],
}, async (request) => {
    const tenantsRef = db.collection('tenants');
    const tenantsSnapshot = await tenantsRef.where('status', '==', 'active').get();

    if (tenantsSnapshot.empty) {
        return { success: true, message: "No active tenants found to process." };
    }

    const propertiesRef = db.collection('properties');
    const propertiesSnap = await propertiesRef.get();
    const propertiesMap = new Map(propertiesSnap.docs.map(doc => [doc.id, doc.data()]));

    const transporter = createTransporter();
    let notificationsSent = 0;
    let lateFeesApplied = 0;
    const today = new Date();
    const dayOfMonth = today.getDate();
    const currentPeriod = format(today, 'yyyy-MM');

    const emailPromises = [];
    const dbBatch = db.batch();

    for (const doc of tenantsSnapshot.docs) {
        const tenant = doc.data() as any;
        
        if (!tenant.dueBalance || tenant.dueBalance <= 0) continue;

        let shouldSendEmail = false;
        let subject = '';
        let body = '';
        let subType = '';
        
        // --- Late Fee Logic ---
        const property = propertiesMap.get(tenant.propertyId);
        const lateFee = property?.lateFee;
        if (tenant.lease.paymentStatus === 'Overdue' && lateFee > 0 && tenant.lease.lastLateFeeAppliedPeriod !== currentPeriod) {
            
            dbBatch.update(doc.ref, {
                dueBalance: admin.firestore.FieldValue.increment(lateFee),
                'lease.lastLateFeeAppliedPeriod': currentPeriod
            });
            
            const paymentRef = db.collection('payments').doc();
            dbBatch.set(paymentRef, {
                tenantId: doc.id,
                amount: lateFee,
                date: format(today, 'yyyy-MM-dd'),
                notes: `Automated late fee for ${format(today, 'MMMM yyyy')}`,
                rentForMonth: currentPeriod,
                status: 'Paid',
                type: 'Adjustment',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            lateFeesApplied++;
        }

        // --- Notification Logic ---
        if (tenant.lease.paymentStatus === 'Overdue') {
            shouldSendEmail = true;
            subType = 'Overdue Notice';
            subject = `Urgent: Overdue Balance for ${tenant.name}`;
            body = `Dear ${tenant.name},\n\nThis is a notice regarding an overdue balance on your account. Your current outstanding balance is Ksh ${tenant.dueBalance.toLocaleString()}.\n\nPlease settle this amount immediately to avoid further action.\n\nThank you,\nEracov Properties`;
        } 
        else if (tenant.lease.paymentStatus === 'Pending' && dayOfMonth >= 2 && dayOfMonth <= 5) {
            shouldSendEmail = true;
            subType = 'Payment Reminder';
            subject = `Reminder: Rent Payment Due Soon`;
            body = `Dear ${tenant.name},\n\nThis is a friendly reminder that your rent payment is due on the 5th of this month. Your current outstanding balance is Ksh ${tenant.dueBalance.toLocaleString()}.\n\nThank you,\nEracov Properties`;
        }

        if (shouldSendEmail) {
            notificationsSent++;
            const mailOptions = {
                from: `"Eracov Properties" <${process.env.EMAIL_USER || emailUser.value()}>`,
                to: tenant.email,
                subject: subject,
                html: body.replace(/\n/g, '<br>')
            };

            emailPromises.push(transporter.sendMail(mailOptions));
            
            const commRef = db.collection('communications').doc();
            dbBatch.set(commRef, {
                recipients: [tenant.email],
                recipientCount: 1,
                relatedTenantId: doc.id,
                type: 'automation',
                subType: subType,
                subject: subject,
                body: mailOptions.html,
                senderId: 'system',
                timestamp: new Date().toISOString(),
                status: 'sent',
            });
        }
    }
    
    // Commit all database writes (late fees, communication logs)
    await dbBatch.commit();
    
    // Send all emails after DB writes are successful
    if(emailPromises.length > 0) {
        await Promise.all(emailPromises);
    }
    
    const message = `Automation complete. Processed ${tenantsSnapshot.size} tenants, sent ${notificationsSent} notifications, and applied ${lateFeesApplied} late fees.`;
    logger.info(message);

    // Log the summary of the automation run
    await db.collection('communications').add({
        senderId: 'system',
        type: 'automation',
        subject: 'Lease Reminder & Late Fee Automation Run',
        body: message,
        recipientCount: notificationsSent,
        timestamp: new Date().toISOString(),
        status: 'sent',
    });

    return { success: true, message: message };
});
