
'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Property, UnitOrientation } from '@/lib/types';
import { unitOrientations, unitOrientationHexColors } from '@/lib/types';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface OrientationOverviewChartProps {
  properties: Property[];
}

export function OrientationOverviewChart({ properties }: OrientationOverviewChartProps) {
  const chartData = useMemo(() => {
    const orientationCounts: { [key in UnitOrientation]?: number } = {};

    properties.forEach(property => {
      if (Array.isArray(property.units)) {
        property.units.forEach(unit => {
          if (unit.unitOrientation) {
            orientationCounts[unit.unitOrientation] = (orientationCounts[unit.unitOrientation] || 0) + 1;
          }
        });
      }
    });

    return unitOrientations.map(orientation => ({
      name: orientation.toLowerCase().replace(/_/g, ' '),
      value: orientationCounts[orientation] || 0,
      fill: unitOrientationHexColors[orientation] || '#a9a9a9'
    })).filter(d => d.value > 0);
    
  }, [properties]);

  const totalUnits = useMemo(() => chartData.reduce((sum, item) => sum + item.value, 0), [chartData]);

  if(totalUnits === 0) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Unit Orientation</CardTitle>
                <CardDescription>A breakdown of units by their orientation.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-muted-foreground">No orientation data available.</p>
            </CardContent>
        </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unit Orientation</CardTitle>
        <CardDescription>A breakdown of {totalUnits} units by their orientation.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              innerRadius={50}
              paddingAngle={2}
              dataKey="value"
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                const RADIAN = Math.PI / 180;
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold">
                    {value}
                  </text>
                );
              }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip 
                formatter={(value: number, name: string) => [`${value} units`, name.charAt(0).toUpperCase() + name.slice(1)]} 
                contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px'
                }}
            />
            <Legend 
                wrapperStyle={{ fontSize: '12px', textTransform: 'capitalize' }} 
                iconType="circle"
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
