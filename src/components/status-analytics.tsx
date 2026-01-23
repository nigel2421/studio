
'use client';

import { Property, Unit, UnitType, unitTypes, ManagementStatus, managementStatuses, HandoverStatus, handoverStatuses } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface StatusAnalyticsProps {
    property: Property;
}

type AnalyticsData = {
    [key in UnitType]?: number;
} & { Total: number };

export function StatusAnalytics({ property }: StatusAnalyticsProps) {
    const [unitTypeFilter, setUnitTypeFilter] = useState<UnitType | 'all'>('all');

    const analytics = useMemo(() => {
        const data: Record<string, AnalyticsData> = {};
        
        if (!Array.isArray(property.units)) {
            return {};
        }

        const filteredUnits = property.units.filter(unit =>
            unitTypeFilter === 'all' || unit.unitType === unitTypeFilter
        );

        const allStatusCategories = [...new Set([...handoverStatuses, ...managementStatuses])];
        
        allStatusCategories.forEach(status => {
            data[status] = { Total: 0 };
            unitTypes.forEach(ut => {
                (data[status] as any)[ut] = 0;
            });
        });

        for (const unit of filteredUnits) {
            if (unit.handoverStatus) {
                const status = unit.handoverStatus;
                (data[status] as any)[unit.unitType] = ((data[status] as any)[unit.unitType] || 0) + 1;
                data[status].Total++;
            }
            if (unit.managementStatus) {
                const status = unit.managementStatus;
                (data[status] as any)[unit.unitType] = ((data[status] as any)[unit.unitType] || 0) + 1;
                data[status].Total++;
            }
        }
        return data;
    }, [property, unitTypeFilter]);
    
    if (!property || !property.units) {
        return null;
    }

    const renderTableSection = (title: string, statuses: readonly string[]) => (
        <>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={unitTypes.length + 2} className="font-bold">{title}</TableCell>
            </TableRow>
            {statuses.map(status => (
                <TableRow key={status}>
                    <TableCell className="pl-8">{status}</TableCell>
                    {unitTypes.map(ut => (
                        <TableCell key={ut} className="text-right">
                            {(analytics[status] as any)?.[ut] || 0}
                        </TableCell>
                    ))}
                    <TableCell className="text-right font-bold">
                        {analytics[status]?.Total || 0}
                    </TableCell>
                </TableRow>
            ))}
        </>
    );

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
                            <TableHead className="min-w-[200px]">Status</TableHead>
                            {unitTypes.map(ut => (
                                <TableHead key={ut} className="text-right min-w-[100px]">{ut}</TableHead>
                            ))}
                            <TableHead className="text-right font-bold min-w-[100px]">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {renderTableSection('Handover Status', handoverStatuses)}
                        {renderTableSection('Management Status', managementStatuses)}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
