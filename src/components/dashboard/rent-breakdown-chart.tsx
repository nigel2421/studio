
'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Payment, Tenant, Property, Unit, UnitType } from '@/lib/types';
import { useMemo } from 'react';
import { unitTypes } from '@/lib/types';

interface RentBreakdownChartProps {
  payments: Payment[];
  tenants: Tenant[];
  properties: Property[];
}

export function RentBreakdownChart({ payments, tenants, properties }: RentBreakdownChartProps) {
  const chartData = useMemo(() => {
    const unitMap = new Map<string, Unit>();
    properties.forEach(p => {
        if (p.units) {
            p.units.forEach(u => {
                unitMap.set(`${p.id}-${u.name}`, u);
            });
        }
    });
    
    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    const breakdown: { [key in UnitType]?: { smRent: number, landlordRent: number } } = {};
    unitTypes.forEach(type => {
        breakdown[type] = { smRent: 0, landlordRent: 0 };
    });

    const rentPayments = payments.filter(p => p.status === 'Paid' && p.type === 'Rent');

    rentPayments.forEach(payment => {
        const tenant = tenantMap.get(payment.tenantId);
        if (!tenant) return;

        const unit = unitMap.get(`${tenant.propertyId}-${tenant.unitName}`);
        if (!unit || !unit.unitType) return;
        
        if (breakdown[unit.unitType]) {
            if (unit.ownership === 'SM') {
                breakdown[unit.unitType]!.smRent += payment.amount;
            } else if (unit.ownership === 'Landlord') {
                breakdown[unit.unitType]!.landlordRent += payment.amount;
            }
        }
    });

    return unitTypes.map(type => ({
      unitType: type,
      ...breakdown[type]
    })).filter(d => d.unitType === 'Studio' || (d.smRent ?? 0) > 0 || (d.landlordRent ?? 0) > 0);

  }, [payments, tenants, properties]);

  if (chartData.length === 0) {
      return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Rent Revenue by Ownership (90d)</CardTitle>
                <CardDescription>Breakdown of rent collected by unit type and ownership.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-muted-foreground">No rent payment data available for the last 90 days.</p>
            </CardContent>
        </Card>
      )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Rent Revenue by Ownership (90d)</CardTitle>
        <CardDescription>Breakdown of rent collected in the past 90 days by unit type and ownership.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} stackOffset="sign">
            <XAxis
              dataKey="unitType"
              stroke="#888888"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888888"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `Ksh ${value / 1000}k`}
            />
            <Tooltip
                formatter={(value: number) => `Ksh ${value.toLocaleString()}`}
                cursor={{fill: 'hsl(var(--muted))'}}
             />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="smRent" name="SM Units" stackId="a" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="landlordRent" name="Landlord Units" stackId="a" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
