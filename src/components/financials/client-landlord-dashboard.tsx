'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Tenant, Payment, Property, Unit } from '@/lib/types';
import { DollarSign, Calendar, Droplets, PlusCircle, AlertCircle, FileDown } from 'lucide-react';
import { format, addMonths, startOfMonth, parseISO } from 'date-fns';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { StatementOptionsDialog } from './statement-options-dialog';
import { generateTenantStatementPDF } from '@/lib/pdf-generator';
import { useLoading } from '@/hooks/useLoading';


interface ClientLandlordDashboardProps {
    tenantDetails: Tenant | null;
    payments: Payment[];
    waterReadings: any[];
    allProperties: Property[];
    units: (Unit & { propertyName: string })[];
}

export function ClientLandlordDashboard({ tenantDetails, payments, waterReadings, allProperties, units }: ClientLandlordDashboardProps) {
    const { toast } = useToast();
    const { startLoading, stopLoading, isLoading: isGenerating } = useLoading();
    
    const latestWaterReading = waterReadings?.[0];
    const monthlyServiceCharge = units.reduce((acc, unit) => acc + (unit.serviceCharge || 0), 0);

    const getPaymentStatusVariant = (status?: Tenant['lease']['paymentStatus']) => {
        switch (status) {
            case 'Paid': return 'default';
            case 'Pending': return 'secondary';
            case 'Overdue': return 'destructive';
            default: return 'outline';
        }
    };

    const nextRentDueDate = tenantDetails ? format(startOfMonth(addMonths(new Date(), 1)), 'yyyy-MM-dd') : 'N/A';

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Service Charge Overview</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Service Charge</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {monthlyServiceCharge.toLocaleString()}</div>
                        {tenantDetails && (
                            <Badge variant={getPaymentStatusVariant(tenantDetails.lease.paymentStatus)} className="mt-1">
                                {tenantDetails.lease.paymentStatus}
                            </Badge>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Latest Water Bill</CardTitle>
                        <Droplets className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {latestWaterReading ? (
                            <>
                                <div className="text-2xl font-bold">Ksh {latestWaterReading.amount.toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground">
                                    Current: {latestWaterReading.currentReading}, Prior: {latestWaterReading.priorReading}
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="text-xl font-bold">Not Available</div>
                                <p className="text-xs text-muted-foreground">No recent reading found.</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">Ksh {(tenantDetails?.dueBalance || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total outstanding amount</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Account Credit</CardTitle>
                        <PlusCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">Ksh {(tenantDetails?.accountBalance || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Overpayment carry-over</p>
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Payment History</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Amount Paid</TableHead>
                                <TableHead>For Month</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.length > 0 ? (
                                payments.map(payment => (
                                    <TableRow key={payment.id}>
                                        <TableCell>{format(new Date(payment.date), 'PPP')}</TableCell>
                                        <TableCell>Ksh {payment.amount.toLocaleString()}</TableCell>
                                        <TableCell>{payment.rentForMonth ? format(new Date(payment.rentForMonth + '-02'), 'MMMM yyyy') : 'N/A'}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center">No payment history found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
