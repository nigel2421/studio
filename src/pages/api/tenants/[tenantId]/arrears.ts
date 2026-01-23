import { NextApiRequest, NextApiResponse } from 'next';
import { getTenant } from '@/lib/data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { tenantId } = req.query;

    if (typeof tenantId !== 'string') {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    try {
      const tenant = await getTenant(tenantId);
      
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // The 'dueBalance' field on the tenant record represents the arrears.
      const arrears = tenant.dueBalance || 0;
      
      res.status(200).json({ arrears });
    } catch (error) {
      console.error(`Error fetching arrears for tenant ${tenantId}:`, error);
      res.status(500).json({ error: 'An error occurred while calculating arrears' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
