'use client';

import { Property, Unit, UnitType, unitTypes, ManagementStatus, managementStatuses, HandoverStatus, handoverStatuses } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMemo } from 'react';

interface StatusAnalyticsProps {
    properties: Property[];
}

type AnalyticsData = {
    [key in UnitType]?: number;
} & { Total: number };

export function StatusAnalytics({ properties }: StatusAnalyticsProps) {

    const analytics = useMemo(() => {
        const data: Record<string, AnalyticsData> = {};

        const allUnits: Unit[] = properties.flatMap(p => p.units || []);

        const allStatusCategories = [...handoverStatuses, ...managementStatuses];
        
        // Initialize data structure
        allStatusCategories.forEach(status => {
            data[status] = { Total: 0 };
            unitTypes.forEach(ut => {
                data[status][ut] = 0;
            });
        });

        // Populate data
        for (const unit of allUnits) {
            if (unit.handoverStatus) {
                const status = unit.handoverStatus;
                if (!data[status]) { // handle case where a status might not be in the constant array
                     data[status] = { Total: 0 };
                     unitTypes.forEach(ut => { (data[status] as any)[ut] = 0; });
                }
                (data[status] as any)[unit.unitType] = ((data[status] as any)[unit.unitType] || 0) + 1;
                data[status].Total++;
            }
            if (unit.managementStatus) {
                const status = unit.managementStatus;
                if (!data[status]) {
                     data[status] = { Total: 0 };
                     unitTypes.forEach(ut => { (data[status] as any)[ut] = 0; });
                }
                (data[status] as any)[unit.unitType] = ((data[status] as any)[unit.unitType] || 0) + 1;
                data[status].Total++;
            }
        }

        return data;
    }, [properties]);
    
    if (!properties || properties.length === 0) {
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
        <Card>
            <CardHeader>
                <CardTitle>Unit Status Analytics</CardTitle>
                <CardDescription>Breakdown of units by status and type.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Status</TableHead>
                            {unitTypes.map(ut => (
                                <TableHead key={ut} className="text-right">{ut}</TableHead>
                            ))}
                            <TableHead className="text-right font-bold">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {renderTableSection('Handover Status', handoverStatuses)}
                        {renderTableSection('Management Status', managementStatuses)}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
