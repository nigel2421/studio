import { NextApiRequest, NextApiResponse } from 'next';
import { getLandlordArrearsBreakdown } from '@/lib/arrears';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { landlordId } = req.query;

    if (typeof landlordId !== 'string') {
      return res.status(400).json({ error: 'Invalid landlord ID' });
    }

    try {
      const landlordArrearsBreakdown = await getLandlordArrearsBreakdown(landlordId);
      res.status(200).json(landlordArrearsBreakdown);
    } catch (error) {
      console.error(`Error fetching arrears breakdown for landlord ${landlordId}:`, error);
      res.status(500).json({ error: 'An error occurred while fetching landlord arrears breakdown' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
