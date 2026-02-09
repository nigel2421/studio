
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Tenant, Payment, Property, Unit, LedgerEntry, PropertyOwner, Landlord, WaterMeterReading } from '@/lib/types';
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
import { PaginationControls } from '../ui/pagination-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


interface ClientLandlordDashboardProps {
    tenantDetails: Tenant | null;
    payments: Payment[];
    waterReadings: WaterMeterReading[];
    allProperties: Property[];
    units: (Unit & { propertyName: string })[];
    owner: PropertyOwner | Landlord | null;
    activeTab: 'service-charge' | 'water';
    onTabChange: (tab: 'service-charge' | 'water') => void;
}

export function ClientLandlordDashboard({ tenantDetails, payments, waterReadings, allProperties, units, owner, activeTab, onTabChange }: ClientLandlordDashboardProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const { serviceChargeLedger, waterLedger, finalDueBalance, finalAccountBalance } = useMemo(() => {
        if (!tenantDetails) {
            return { serviceChargeLedger: [], waterLedger: [], finalDueBalance: 0, finalAccountBalance: 0 };
        }
        // Generate full ledger for balances
        const { ledger: fullLedger, finalDueBalance, finalAccountBalance } = generateLedger(tenantDetails, payments, allProperties, waterReadings, owner);
        // Generate specific ledgers for display
        const { ledger: scLedger } = generateLedger(tenantDetails, payments, allProperties, waterReadings, owner, undefined, { includeWater: false, includeRent: false, includeServiceCharge: true });
        const { ledger: wLedger } = generateLedger(tenantDetails, payments, allProperties, waterReadings, owner, undefined, { includeRent: false, includeServiceCharge: false, includeWater: true });

        return {
            serviceChargeLedger: scLedger.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            waterLedger: wLedger.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            finalDueBalance,
            finalAccountBalance
        };
    }, [tenantDetails, payments, allProperties, waterReadings, owner]);
    
    const renderLedgerTable = (ledgerEntries: LedgerEntry[]) => {
      const totalPages = Math.ceil(ledgerEntries.length / pageSize);
      const paginatedLedger = ledgerEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>For Month</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Charge</TableHead>
                        <TableHead className="text-right">Payment</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedLedger.length > 0 ? (
                        paginatedLedger.map((entry, index) => (
                            <TableRow key={`${entry.id}-${index}`}>
                                <TableCell>{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
                                <TableCell>{entry.forMonth}</TableCell>
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
                            <TableCell colSpan={6} className="text-center">No transaction history found.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            {totalPages > 1 && (
                <div className="p-4 border-t">
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        totalItems={ledgerEntries.length}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            )}
        </>
      )
    };
    
    const latestWaterReading = waterReadings?.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Service Charge</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {monthlyServiceCharge.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">For {units.length} unit(s)</p>
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
                                    {latestWaterReading.consumption} units consumed
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="text-xl font-bold">Not Available</div>
                                <p className="text-xs text-muted-foreground">No recent reading.</p>
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
                <CardContent className="p-0">
                    <Tabs defaultValue={activeTab} onValueChange={(value) => onTabChange(value as 'service-charge' | 'water')}>
                        <TabsList className="px-6 border-b w-full justify-start rounded-none">
                            <TabsTrigger value="service-charge">Service Charge</TabsTrigger>
                            <TabsTrigger value="water">Water Bills</TabsTrigger>
                        </TabsList>
                        <TabsContent value="service-charge">
                            {renderLedgerTable(serviceChargeLedger)}
                        </TabsContent>
                        <TabsContent value="water">
                             {renderLedgerTable(waterLedger)}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
