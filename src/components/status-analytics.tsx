
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

// Helper function to map old statuses to new ones
const normalizeManagementStatus = (status?: string): ManagementStatus | undefined => {
    if (!status) return undefined;
    switch (status) {
        case 'Renting Mngd by Eracov for SM':
            return 'Rented for Soil Merchants';
        case 'Renting Mngd by Eracov for Client':
            return 'Rented for Clients';
        case 'Client Self Fully Managed':
            return 'Client Managed';
        case 'Reserved for Airbnb': // This was removed but might still be in the DB
            return 'Airbnb';
        default:
            // Check if it's one of the valid new statuses
            if ((managementStatuses as readonly string[]).includes(status)) {
                return status as ManagementStatus;
            }
            return undefined; // Ignore unknown statuses
    }
};


export function StatusAnalytics({ property }: StatusAnalyticsProps) {
    const [unitTypeFilter, setUnitTypeFilter] = useState<UnitType | 'all'>('all');

    const { analytics, handoverTotals, managementTotals, grandTotals, allUnitsHandedOver } = useMemo(() => {
        const data: Record<string, AnalyticsData> = {};
        
        if (!Array.isArray(property.units)) {
            return { analytics: {}, handoverTotals: null, managementTotals: null, grandTotals: null, allUnitsHandedOver: false };
        }
        
        const allUnitsHandedOver = property.units.every(unit => unit.handoverStatus === 'Handed Over');

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
            // Check handoverStatus and ensure it exists in our data object before incrementing
            if (unit.handoverStatus && data[unit.handoverStatus] && unit.unitType) {
                const status = unit.handoverStatus;
                if(data[status] && typeof (data[status] as any)[unit.unitType] !== 'undefined') {
                    (data[status] as any)[unit.unitType] += 1;
                    data[status].Total++;
                }
            }
            
            // Normalize the management status to handle old data
            const normalizedStatus = normalizeManagementStatus(unit.managementStatus);

            // Check managementStatus and ensure it exists in our data object before incrementing
            if (normalizedStatus && data[normalizedStatus] && unit.unitType) {
                const status = normalizedStatus;
                 if(data[status] && typeof (data[status] as any)[unit.unitType] !== 'undefined') {
                    (data[status] as any)[unit.unitType] += 1;
                    data[status].Total++;
                }
            }
        }
        
        const createTotalsRow = (statuses: readonly string[]): AnalyticsData => {
            const totals: AnalyticsData = { Total: 0 };
            unitTypes.forEach(ut => (totals as any)[ut] = 0);

            statuses.forEach(status => {
                if (data[status]) {
                    unitTypes.forEach(ut => {
                        (totals as any)[ut] += (data[status] as any)[ut] || 0;
                    });
                    totals.Total += data[status].Total || 0;
                }
            });
            return totals;
        };
        
        const handoverTotals = createTotalsRow(handoverStatuses);
        const managementTotals = createTotalsRow(managementStatuses);
        
        const grandTotals: AnalyticsData = { Total: 0 };
        unitTypes.forEach(ut => (grandTotals as any)[ut] = 0);
        filteredUnits.forEach(unit => {
            if (unit.unitType && (grandTotals as any)[unit.unitType] !== undefined) {
                (grandTotals as any)[unit.unitType]++;
            }
        });
        grandTotals.Total = filteredUnits.length;

        return { analytics: data, handoverTotals, managementTotals, grandTotals, allUnitsHandedOver };
    }, [property, unitTypeFilter]);
    
    if (!property || !property.units) {
        return null;
    }

    const renderTotalsRow = (title: string, totals: AnalyticsData | null, isGrandTotal = false) => {
        if (!totals) return null;
        return (
             <TableRow className="bg-muted hover:bg-muted font-bold">
                <TableCell className={isGrandTotal ? "" : "pl-8"}>{title}</TableCell>
                {unitTypes.map(ut => (
                    <TableCell key={ut} className="text-right">
                        {(totals as any)[ut] || 0}
                    </TableCell>
                ))}
                <TableCell className="text-right">
                    {totals.Total || 0}
                </TableCell>
            </TableRow>
        )
    }

    const renderTableSection = (title: string, statuses: readonly string[], totals: AnalyticsData | null) => (
        <>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={unitTypes.length + 2} className="font-bold">{title}</TableCell>
            </TableRow>
            {statuses.map(status => (
                <TableRow key={status}>
                    <TableCell className="pl-8">{status}</TableCell>
                    {unitTypes.map(ut => (
                        <TableCell key={ut} className="text-right">
                            {analytics[status]?.[ut] || 0}
                        </TableCell>
                    ))}
                    <TableCell className="text-right font-bold">
                        {analytics[status]?.Total || 0}
                    </TableCell>
                </TableRow>
            ))}
            {renderTotalsRow(`Total ${title}`, totals)}
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
                            <TableHead className="min-w-[200px] font-bold text-primary">Status</TableHead>
                            {unitTypes.map(ut => (
                                <TableHead key={ut} className="text-right min-w-[100px] font-bold text-primary">{ut}</TableHead>
                            ))}
                            <TableHead className="text-right font-bold min-w-[100px] text-primary">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!allUnitsHandedOver && renderTableSection('Handover Status', handoverStatuses, handoverTotals)}
                        {renderTableSection('Management Status', managementStatuses, managementTotals)}
                        {renderTotalsRow('Grand Total', grandTotals, true)}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
