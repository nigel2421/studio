'use client';

import { useMemo, useState } from 'react';
import type { Property, UnitOrientation, Tenant, UnitType } from '@/lib/types';
import { unitOrientations, unitTypes } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OrientationAnalyticsProps {
    property: Property;
    tenants: Tenant[];
}

interface OrientationStats {
    rented: number;
    vacant: number;
}

type FloorOrientationData = {
    [key in UnitOrientation]?: OrientationStats;
} & { Total: OrientationStats };

const parseFloorFromUnitName = (unitName: string): string | null => {
    const match = unitName.match(/(?:\s|-)(\d{1,2})(?:-|\s|$|[A-Z])/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
};

export function OrientationAnalytics({ property, tenants }: OrientationAnalyticsProps) {
    const [unitTypeFilter, setUnitTypeFilter] = useState<UnitType | 'all'>('all');

    const { analyticsData, totals } = useMemo(() => {
        const data: Record<string, FloorOrientationData> = {};
        const grandTotals: FloorOrientationData = { Total: { rented: 0, vacant: 0 } };
        unitOrientations.forEach(o => (grandTotals as any)[o] = { rented: 0, vacant: 0 });

        if (!Array.isArray(property.units)) {
            return { analyticsData: {}, totals: grandTotals };
        }
        
        const filteredUnits = property.units.filter(unit =>
            unitTypeFilter === 'all' || unit.unitType === unitTypeFilter
        );

        const occupiedUnitIdentifiers = new Set(
            tenants
                .filter(t => t.propertyId === property.id)
                .map(t => t.unitName)
        );

        const floorSet = new Set<string>();
        filteredUnits.forEach(unit => {
            if (unit.unitOrientation) { // Only consider units with an orientation
                const floor = parseFloorFromUnitName(unit.name);
                if(floor) floorSet.add(floor);
            }
        });

        const sortedFloors = Array.from(floorSet).sort((a,b) => parseInt(a) - parseInt(b));

        sortedFloors.forEach(floor => {
            data[floor] = { Total: { rented: 0, vacant: 0 } };
            unitOrientations.forEach(o => (data[floor] as any)[o] = { rented: 0, vacant: 0 });
        });

        for (const unit of filteredUnits) {
            const floorNumber = parseFloorFromUnitName(unit.name);
            if (!floorNumber || !data[floorNumber] || !unit.unitOrientation) continue;

            const floorData = data[floorNumber];
            
            const orientationData = floorData[unit.unitOrientation] as OrientationStats | undefined;
            if (orientationData) {
                 const isOccupied = occupiedUnitIdentifiers.has(unit.name) || unit.status !== 'vacant';

                if (isOccupied) {
                    orientationData.rented++;
                    floorData.Total.rented++;
                    (grandTotals[unit.unitOrientation] as OrientationStats).rented++;
                    grandTotals.Total.rented++;
                } else {
                    orientationData.vacant++;
                    floorData.Total.vacant++;
                    (grandTotals[unit.unitOrientation] as OrientationStats).vacant++;
                    grandTotals.Total.vacant++;
                }
            }
        }

        return { analyticsData: data, totals: grandTotals };
    }, [property, tenants, unitTypeFilter]);

    if (!property || !property.units || Object.keys(analyticsData).length === 0) {
        return (
             <div className="pt-4 space-y-4">
                <div className="flex justify-end">
                    <Select value={unitTypeFilter} onValueChange={(value) => setUnitTypeFilter(value as UnitType | 'all')}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="Filter by Unit Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Unit Types</SelectItem>
                            {unitTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="text-center py-10 border rounded-lg mt-4">
                    <p className="text-sm text-muted-foreground">No units with orientation data found for this property with the selected filter.</p>
                </div>
            </div>
        );
    }
    
    const renderCell = (data: OrientationStats) => {
        const total = data.rented + data.vacant;
        if (total === 0) return <span className="text-muted-foreground">-</span>;
        
        return (
            <div className="flex flex-col text-right">
                <span className="font-semibold">{data.rented} / {total}</span>
                <span className="text-xs text-muted-foreground">
                    Rented
                </span>
            </div>
        )
    }

    return (
        <div className="pt-4 space-y-4">
            <div className="flex justify-end">
                <Select value={unitTypeFilter} onValueChange={(value) => setUnitTypeFilter(value as UnitType | 'all')}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filter by Unit Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Unit Types</SelectItem>
                        {unitTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
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
