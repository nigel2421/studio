'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Payment, Tenant } from '@/lib/types';
import { useMemo } from 'react';

interface FinancialOverviewChartProps {
  payments: Payment[];
  tenants: Tenant[];
}

export function FinancialOverviewChart({ payments, tenants }: FinancialOverviewChartProps) {
  const chartData = useMemo(() => {
    const rentCollected = payments
      .filter(p => p.type === 'Rent' && p.status === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);

    const rentDue = tenants
      .filter(t => t.residentType === 'Tenant')
      .reduce((sum, t) => sum + (t.dueBalance || 0), 0);
      
    return [
      {
        name: 'Financials',
        "Rent Collected": rentCollected,
        "Outstanding Rent": rentDue,
      },
    ];
  }, [payments, tenants]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Overview</CardTitle>
        <CardDescription>A summary of rent collected vs. outstanding rent.</CardDescription>
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
            <Bar dataKey="Rent Collected" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Outstanding Rent" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
