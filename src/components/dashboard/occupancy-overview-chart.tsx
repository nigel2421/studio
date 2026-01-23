
'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Property, Tenant } from '@/lib/types';
import { useMemo } from 'react';

interface OccupancyOverviewChartProps {
  properties: Property[];
  tenants: Tenant[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];

export function OccupancyOverviewChart({ properties, tenants }: OccupancyOverviewChartProps) {
  const chartData = useMemo(() => {
    const totalUnits = properties.reduce((sum, p) => sum + (p.units?.length || 0), 0);
    const occupiedUnitIdentifiers = new Set<string>();

    tenants.forEach(tenant => {
      occupiedUnitIdentifiers.add(`${tenant.propertyId}-${tenant.unitName}`);
    });
    
    properties.forEach(property => {
      if (Array.isArray(property.units)) {
        property.units.forEach(unit => {
          if (unit.status !== 'vacant') {
            occupiedUnitIdentifiers.add(`${property.id}-${unit.name}`);
          }
        });
      }
    });

    const occupiedUnits = occupiedUnitIdentifiers.size;
    const vacantUnits = totalUnits - occupiedUnits;
    
    return [
      { name: 'Occupied', value: occupiedUnits },
      { name: 'Vacant', value: vacantUnits },
    ];
  }, [properties, tenants]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Occupancy Overview</CardTitle>
        <CardDescription>A breakdown of occupied vs. vacant units.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={100}
              innerRadius={65}
              fill="#8884d8"
              dataKey="value"
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                const RADIAN = Math.PI / 180;
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold">
                    {`${value}`}
                  </text>
                );
              }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [`${value} units`, name]} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
