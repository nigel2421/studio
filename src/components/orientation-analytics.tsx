
'use client';

import { useMemo } from 'react';
import type { Property, UnitOrientation } from '@/lib/types';
import { unitOrientations } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface OrientationAnalyticsProps {
    property: Property;
}

interface FloorData {
    count: number;
    totalRent: number;
}

type FloorOrientationData = {
    [key in UnitOrientation]?: FloorData;
} & { Total: FloorData };

const parseFloorFromUnitName = (unitName: string): string | null => {
    const match = unitName.match(/(?:\s|-)(\d{1,2})(?:-|\s|$|[A-Z])/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
};

export function OrientationAnalytics({ property }: OrientationAnalyticsProps) {

    const { analyticsData, totals } = useMemo(() => {
        const data: Record<string, FloorOrientationData> = {};
        const grandTotals: FloorOrientationData = { Total: { count: 0, totalRent: 0 } };
        unitOrientations.forEach(o => (grandTotals as any)[o] = { count: 0, totalRent: 0 });

        if (!Array.isArray(property.units)) {
            return { analyticsData: {}, totals: grandTotals };
        }

        const floorSet = new Set<string>();
        property.units.forEach(unit => {
            const floor = parseFloorFromUnitName(unit.name);
            if(floor) floorSet.add(floor);
        });

        const sortedFloors = Array.from(floorSet).sort((a,b) => parseInt(a) - parseInt(b));

        sortedFloors.forEach(floor => {
            data[floor] = { Total: { count: 0, totalRent: 0 } };
            unitOrientations.forEach(o => (data[floor] as any)[o] = { count: 0, totalRent: 0 });
        });

        for (const unit of property.units) {
            const floorNumber = parseFloorFromUnitName(unit.name);
            if (!floorNumber || !data[floorNumber] || !unit.unitOrientation) continue;

            const floorData = data[floorNumber];
            const rent = unit.rentAmount || 0;
            
            const orientationData = floorData[unit.unitOrientation] as FloorData | undefined;
            if (orientationData) {
                orientationData.count++;
                orientationData.totalRent += rent;
                floorData.Total.count++;
                floorData.Total.totalRent += rent;
                
                const grandTotalOrientation = grandTotals[unit.unitOrientation] as FloorData | undefined;
                if(grandTotalOrientation) {
                    grandTotalOrientation.count++;
                    grandTotalOrientation.totalRent += rent;
                    grandTotals.Total.count++;
                    grandTotals.Total.totalRent += rent;
                }
            }
        }

        return { analyticsData: data, totals: grandTotals };
    }, [property]);

    if (!property || !property.units || Object.keys(analyticsData).length === 0) {
        return (
            <div className="text-center py-10 border rounded-lg mt-4">
                <p className="text-sm text-muted-foreground">No units with orientation data found for this property.</p>
            </div>
        );
    }
    
    const renderCell = (data: FloorData) => {
        if (data.count === 0) return <span className="text-muted-foreground">-</span>;
        const avgRent = data.totalRent / data.count;
        return (
            <div className="flex flex-col text-right">
                <span className="font-semibold">{data.count} unit{data.count > 1 ? 's' : ''}</span>
                <span className="text-xs text-muted-foreground">
                    Avg: Ksh {Math.round(avgRent).toLocaleString()}
                </span>
            </div>
        )
    }

    return (
        <div className="pt-4 space-y-4">
            <div className="border rounded-md overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-bold text-primary min-w-[80px]">Floor</TableHead>
                            {unitOrientations.map(orientation => (
                                <TableHead key={orientation} className="text-right font-bold text-primary min-w-[150px]">{orientation}</TableHead>
                            ))}
                            <TableHead className="text-right font-bold text-primary min-w-[150px]">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Object.entries(analyticsData).map(([floor, data]) => (
                            <TableRow key={floor}>
                                <TableCell className="font-medium">Floor {floor}</TableCell>
                                {unitOrientations.map(orientation => (
                                    <TableCell key={orientation} className="text-right">
                                        {renderCell((data as any)[orientation])}
                                    </TableCell>
                                ))}
                                <TableCell className="text-right font-bold">{renderCell(data.Total)}</TableCell>
                            </TableRow>
                        ))}
                         <TableRow className="bg-muted hover:bg-muted font-bold">
                            <TableCell>Grand Total</TableCell>
                             {unitOrientations.map(orientation => (
                                <TableCell key={orientation} className="text-right">
                                    {renderCell((totals as any)[orientation])}
                                </TableCell>
                            ))}
                            <TableCell className="text-right">{renderCell(totals.Total)}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
