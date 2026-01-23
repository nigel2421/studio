import { NextApiRequest, NextApiResponse } from 'next';
import { getTenantsInArrears } from '@/lib/arrears';
import { getProperties } from '@/lib/data';
import { Property, Unit } from '@/lib/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const tenantsInArrears = await getTenantsInArrears();
      const allProperties = await getProperties();
      
      // Create a lookup map for units for efficient access
      const unitMap = new Map<string, Unit>();
      allProperties.forEach(p => {
        p.units.forEach(u => {
          // Assuming unit names are unique within a property
          unitMap.set(`${p.id}-${u.name}`, u);
        });
      });

      // Enrich the tenant data with the full unit object
      const enrichedData = tenantsInArrears.map(({ tenant, arrears }) => ({
        tenant: {
          ...tenant,
          unit: unitMap.get(`${tenant.propertyId}-${tenant.unitName}`) || null,
        },
        arrears,
      }));

      res.status(200).json(enrichedData);
    } catch (error) {
      console.error('Error fetching tenants in arrears:', error);
      res.status(500).json({ error: 'An error occurred while fetching tenants in arrears' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
