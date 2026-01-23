'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Cell } from 'recharts';
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
    
    const collectedThisMonth = payments
      .filter(p => 
        p.status === 'Paid' && 
        isSameMonth(new Date(p.date), now)
      )
      .reduce((sum, p) => sum + p.amount, 0);

    const totalOutstanding = tenants.reduce((sum, t) => sum + (t.dueBalance || 0), 0);
      
    return [
      {
        name: 'Collected This Month',
        amount: collectedThisMonth,
        fill: 'hsl(var(--primary))',
      },
      {
        name: 'Total Outstanding',
        amount: totalOutstanding,
        fill: 'hsl(var(--destructive))',
      },
    ];
  }, [payments, tenants]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collections Overview</CardTitle>
        <CardDescription>A real-time overview of payments collected against all outstanding balances.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="name"
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
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                 {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                 ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
