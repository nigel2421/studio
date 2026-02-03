
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Tenant, Payment, Property, Unit, LedgerEntry } from '@/lib/types';
import { DollarSign, Calendar, Droplets, PlusCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { generateLedger } from '@/lib/financial-logic';

interface ClientLandlordDashboardProps {
    tenantDetails: Tenant | null;
    payments: Payment[];
    waterReadings: any[];
    allProperties: Property[];
    units: (Unit & { propertyName: string })[];
}

export function ClientLandlordDashboard({ tenantDetails, payments, waterReadings, allProperties, units }: ClientLandlordDashboardProps) {
    
    const { ledger, finalDueBalance, finalAccountBalance } = useMemo(() => {
        if (!tenantDetails) {
            return { ledger: [], finalDueBalance: 0, finalAccountBalance: 0 };
        }
        return generateLedger(tenantDetails, payments, allProperties);
    }, [tenantDetails, payments, allProperties]);

    const latestWaterReading = waterReadings?.[0];
    const monthlyServiceCharge = units.reduce((acc, unit) => acc + (unit.serviceCharge || 0), 0);

    if (!tenantDetails) {
        return (
            <div className="text-center py-10">
                <p className="text-muted-foreground">Could not load homeowner details.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">Ksh {(finalDueBalance || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total outstanding amount</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Account Credit</CardTitle>
                        <PlusCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">Ksh {(finalAccountBalance || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Overpayment carry-over</p>
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Your Units & Monthly Service Charge</CardTitle>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Property</TableHead>
                                <TableHead>Unit Name</TableHead>
                                <TableHead className="text-right">Monthly Service Charge</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {units.map(unit => (
                                <TableRow key={unit.name}>
                                    <TableCell>{unit.propertyName}</TableCell>
                                    <TableCell>{unit.name}</TableCell>
                                    <TableCell className="text-right">Ksh {(unit.serviceCharge || 0).toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                             <TableRow className="font-bold bg-muted">
                                <TableCell colSpan={2}>Total Monthly Service Charge</TableCell>
                                <TableCell className="text-right">Ksh {monthlyServiceCharge.toLocaleString()}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>A summary of your recent charges and payments.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Charge</TableHead>
                                <TableHead className="text-right">Payment</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ledger.length > 0 ? (
                                ledger.slice(-10).reverse().map((entry, index) => ( // Show last 10 transactions
                                    <TableRow key={`${entry.id}-${index}`}>
                                        <TableCell>{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
                                        <TableCell>{entry.description}</TableCell>
                                        <TableCell className="text-right text-red-600">
                                            {entry.charge > 0 ? `Ksh ${entry.charge.toLocaleString()}`: '-'}
                                        </TableCell>
                                        <TableCell className="text-right text-green-600">
                                            {entry.payment > 0 ? `Ksh ${entry.payment.toLocaleString()}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-bold">
                                             {entry.balance < 0
                                                ? <span className="text-green-600">Ksh {Math.abs(entry.balance).toLocaleString()} Cr</span>
                                                : `Ksh ${entry.balance.toLocaleString()}`
                                            }
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center">No transaction history found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
