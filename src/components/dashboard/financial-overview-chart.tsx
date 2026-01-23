
'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Payment, Tenant } from '@/lib/types';
import { useMemo } from 'react';
import { isSameMonth } from 'date-fns';

interface FinancialOverviewChartProps {
  payments: Payment[];
  tenants: Tenant[];
}

export function FinancialOverviewChart({ payments, tenants }: FinancialOverviewChartProps) {
  const chartData = useMemo(() => {
    const now = new Date();
    
    // Calculate total expected rent from all active tenants
    const expectedMonthlyRevenue = tenants
      .filter(t => t.residentType === 'Tenant')
      .reduce((sum, t) => sum + (t.lease?.rent || 0), 0);

    // Calculate rent collected within the current month
    const collectedThisMonth = payments
      .filter(p => 
        p.type === 'Rent' && 
        p.status === 'Paid' && 
        isSameMonth(new Date(p.date), now)
      )
      .reduce((sum, p) => sum + p.amount, 0);
      
    return [
      {
        name: 'Current Month Revenue',
        "Collected": collectedThisMonth,
        "Expected": expectedMonthlyRevenue,
      },
    ];
  }, [payments, tenants]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Revenue Target</CardTitle>
        <CardDescription>A real-time overview of rent collected against the expected monthly total.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="name"
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `Ksh ${value / 1000}k`}
            />
            <Tooltip
                formatter={(value: number) => `Ksh ${value.toLocaleString()}`}
                cursor={{fill: 'hsl(var(--muted))'}}
             />
            <Legend />
            <Bar dataKey="Collected" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expected" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
