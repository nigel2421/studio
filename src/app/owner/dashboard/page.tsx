'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Home, Users, Wallet } from 'lucide-react';
import { getTenants } from '@/lib/data';

interface OwnedUnit extends Unit {
    propertyName: string;
    propertyAddress: string;
    tenantName?: string;
    rent?: number;
    paymentStatus?: 'Paid' | 'Pending' | 'Overdue';
}

export default function OwnerDashboardPage() {
    const { userProfile, isLoading } = useAuth();
    const [ownedUnits, setOwnedUnits] = useState<OwnedUnit[]>([]);
    const [summary, setSummary] = useState({ totalUnits: 0, occupiedUnits: 0, rentCollected: 0 });

    useEffect(() => {
        async function fetchData() {
            if (userProfile?.role === 'homeowner' && userProfile.propertyOwnerDetails) {
                const tenants = await getTenants();
                const ownerDetails = userProfile.propertyOwnerDetails;
                
                const units: OwnedUnit[] = [];
                let rentCollected = 0;
                let occupiedCount = 0;

                ownerDetails.properties.forEach(prop => {
                    prop.units.forEach(unit => {
                        const tenant = tenants.find(t => t.propertyId === prop.property.id && t.unitName === unit.name);
                        const isOccupied = !!tenant;

                        if (isOccupied) {
                            occupiedCount++;
                            if (tenant.lease.paymentStatus === 'Paid') {
                                rentCollected += tenant.lease.rent || 0;
                            }
                        }

                        units.push({
                            ...unit,
                            propertyName: prop.property.name,
                            propertyAddress: prop.property.address,
                            tenantName: tenant?.name,
                            rent: tenant?.lease?.rent,
                            paymentStatus: tenant?.lease?.paymentStatus,
                        });
                    });
                });
                
                setOwnedUnits(units);
                setSummary({
                    totalUnits: units.length,
                    occupiedUnits: occupiedCount,
                    rentCollected: rentCollected,
                });
            }
        }
        fetchData();
    }, [userProfile]);

    if (isLoading) {
        return <div>Loading dashboard...</div>;
    }

    const getStatusVariant = (paymentStatus?: string, unitStatus?: string) => {
        if (paymentStatus) {
            switch (paymentStatus) {
                case 'Paid': return 'default';
                case 'Pending': return 'secondary';
                case 'Overdue': return 'destructive';
            }
        }
        if (unitStatus === 'vacant') return 'outline';
        return 'secondary';
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Owned Units</CardTitle>
                        <Home className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.totalUnits}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Occupied Units</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.occupiedUnits}</div>
                        <p className="text-xs text-muted-foreground">
                            {summary.totalUnits > 0 ? ((summary.occupiedUnits / summary.totalUnits) * 100).toFixed(0) : 0}% occupancy
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Rent Collected (This Period)</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {summary.rentCollected.toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Your Properties</CardTitle>
                    <CardDescription>A list of all units assigned to you.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Property</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Tenant</TableHead>
                                <TableHead>Monthly Rent</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ownedUnits.map((unit, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <div className="font-medium">{unit.propertyName}</div>
                                        <div className="text-xs text-muted-foreground">{unit.propertyAddress}</div>
                                    </TableCell>
                                    <TableCell>{unit.name}</TableCell>
                                    <TableCell>{unit.tenantName || 'N/A'}</TableCell>
                                    <TableCell>{unit.rent ? `Ksh ${unit.rent.toLocaleString()}` : 'N/A'}</TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(unit.paymentStatus, unit.status)}>
                                            {unit.paymentStatus || 'Vacant'}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
