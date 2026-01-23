'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { MaintenanceRequest } from '@/lib/types';
import { useMemo } from 'react';

interface MaintenanceOverviewChartProps {
  maintenanceRequests: MaintenanceRequest[];
}

const COLORS: Record<MaintenanceRequest['status'], string> = {
    'New': 'hsl(var(--destructive))',
    'In Progress': 'hsl(var(--accent))',
    'Completed': 'hsl(var(--primary))',
};

export function MaintenanceOverviewChart({ maintenanceRequests }: MaintenanceOverviewChartProps) {
  const chartData = useMemo(() => {
    const statusCounts = maintenanceRequests.reduce((acc, req) => {
      acc[req.status] = (acc[req.status] || 0) + 1;
      return acc;
    }, {} as Record<MaintenanceRequest['status'], number>);
    
    return [
      { status: 'New', count: statusCounts['New'] || 0 },
      { status: 'In Progress', count: statusCounts['In Progress'] || 0 },
      { status: 'Completed', count: statusCounts['Completed'] || 0 },
    ];
  }, [maintenanceRequests]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance Requests</CardTitle>
        <CardDescription>A summary of requests by status.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="status"
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
              allowDecimals={false}
            />
            <Tooltip
                formatter={(value: number) => [`${value} requests`, 'Count']}
                cursor={{fill: 'hsl(var(--muted))'}}
             />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS]} />
                ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
