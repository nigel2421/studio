import { NextApiRequest, NextApiResponse } from 'next';
import { getTenant, logCommunication } from '@/lib/data';
import { auth } from '@/lib/firebase'; // Assuming you have a way to get the current user

// This is a placeholder for your actual email sending service.
async function sendArrearsReminder(tenantEmail: string, arrearsAmount: number) {
  // In a real application, you would integrate a service like SendGrid or Nodemailer.
  console.log(`Simulating: Sending arrears reminder to ${tenantEmail} for the amount of ${arrearsAmount.toFixed(2)}`);
  // To simulate a network delay, we'll wait for a moment.
  await new Promise(resolve => setTimeout(resolve, 500));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { tenantId, arrears } = req.body;

    if (!tenantId || typeof arrears !== 'number') {
      return res.status(400).json({ error: 'Invalid input, requires tenantId and arrears' });
    }

    try {
      const tenant = await getTenant(tenantId);

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // 1. Send the actual reminder (e.g., via email)
      await sendArrearsReminder(tenant.email, arrears);

      // 2. Log this action in the communications collection
      // This requires knowing who is sending the notification. 
      // For this example, we'll assume a generic 'System' user or pull from auth.
      const currentUser = auth.currentUser;
      const sender = currentUser ? currentUser.displayName || currentUser.email : 'System';

      await logCommunication({
        tenantId: tenant.id,
        type: 'Email',
        subject: 'Overdue Rent Reminder',
        message: `Dear ${tenant.name}, this is a reminder that your account is in arrears by ${arrears.toFixed(2)}. Please make a payment as soon as possible.`,
        sender: sender || 'Automated System',
      });

      res.status(200).json({ message: 'Arrears reminder sent and logged successfully' });
    } catch (error) {
      console.error(`Error processing arrears notification for tenant ${tenantId}:`, error);
      res.status(500).json({ error: 'An error occurred while sending the reminder' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
