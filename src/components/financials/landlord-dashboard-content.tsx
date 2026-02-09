
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Banknote, Wallet, Building2, TrendingUp, Download, Coins } from 'lucide-react';
import { Payment, Property, Tenant, Unit } from '@/lib/types';
import { FinancialSummary, calculateTransactionBreakdown, generateLandlordDisplayTransactions } from '@/lib/financial-utils';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { downloadCSV } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, addMonths, differenceInDays } from 'date-fns';

interface LandlordDashboardContentProps {
    properties: { property: Property, units: Unit[] }[];
    tenants: Tenant[];
    payments: Payment[];
    financialSummary: FinancialSummary;
}

export function LandlordDashboardContent({ properties, tenants, payments, financialSummary }: LandlordDashboardContentProps) {
    const [lastMonths, setLastMonths] = useState(12);

    const unitMap = useMemo(() => {
        const map = new Map<string, Unit>();
        properties.forEach(p => {
            p.units.forEach(u => {
                map.set(`${p.property.id}-${u.name}`, u);
            });
        });
        return map;
    }, [properties]);

    const displayTransactions = useMemo(() => {
        return generateLandlordDisplayTransactions(payments, tenants, properties);
    }, [payments, tenants, properties]);


    const transactionTotals = useMemo(() => {
        return displayTransactions.reduce((acc, t) => {
            acc.gross += t.gross;
            acc.serviceChargeDeduction += t.serviceChargeDeduction;
            acc.managementFee += t.managementFee;
            acc.otherCosts += t.otherCosts || 0;
            acc.netToLandlord += t.netToLandlord;
            return acc;
        }, {
            gross: 0,
            serviceChargeDeduction: 0,
            managementFee: 0,
            otherCosts: 0,
            netToLandlord: 0,
        });
    }, [displayTransactions]);


    const handleExport = () => {
        const data = displayTransactions.map(t => ({
            Date: new Date(t.date).toLocaleDateString(),
            Unit: t.unitName || 'Unknown',
            For_Month: t.forMonth,
            "Gross Amount": t.gross,
            "Service Charge Deduction": t.serviceChargeDeduction,
            "Management Fee": t.managementFee,
            "Other Costs": t.otherCosts || 0,
            "Net Payout": t.netToLandlord,
        }));
        downloadCSV(data, 'landlord_financial_statement.csv');
    };

    return (
        <div className="flex flex-col gap-8 pb-10">

            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium">Total Rent (Gross)</CardTitle>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {transactionTotals.gross.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total gross rent from payments</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium">Service Charges (Occupied)</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {transactionTotals.serviceChargeDeduction.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Deducted from occupied units</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium">Service Charges (Vacant)</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {(financialSummary.vacantUnitServiceChargeDeduction || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Deducted for vacant units</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium">Management Fees</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {transactionTotals.managementFee.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">5% agency fee on rent</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium">Other Costs</CardTitle>
                        <Coins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {transactionTotals.otherCosts.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Transaction fees</p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-primary">Net Rent Payout</CardTitle>
                        <Wallet className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">Ksh {(transactionTotals.netToLandlord - (financialSummary.vacantUnitServiceChargeDeduction || 0)).toLocaleString()}</div>
                        <p className="text-xs text-primary/80">Available for payout</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Transaction History</CardTitle>
                        <CardDescription>Detailed breakdown of recent payments and deductions.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>For Month</TableHead>
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">S. Charge</TableHead>
                                <TableHead className="text-right">Mgmt Fee</TableHead>
                                <TableHead className="text-right">Other Costs</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayTransactions.map((transaction) => (
                                    <TableRow key={transaction.id}>
                                        <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{transaction.unitName}</div>
                                            <div className="text-xs text-muted-foreground">{transaction.unitType}</div>
                                        </TableCell>
                                        <TableCell>{transaction.forMonth}</TableCell>
                                        <TableCell className="text-right">Ksh {transaction.gross.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">- {transaction.serviceChargeDeduction.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">- {transaction.managementFee.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">- {(transaction.otherCosts || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-bold">Ksh {transaction.netToLandlord.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                        </TableBody>
                         <TableFooter>
                            <TableRow>
                                <TableCell colSpan={3} className="font-bold text-right">Totals</TableCell>
                                <TableCell className="text-right font-bold">Ksh {transactionTotals.gross.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-muted-foreground">- {transactionTotals.serviceChargeDeduction.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-muted-foreground">- {transactionTotals.managementFee.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-muted-foreground">- {transactionTotals.otherCosts.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold">Ksh {transactionTotals.netToLandlord.toLocaleString()}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
               <Card>
                    <CardHeader>
                        <CardTitle>Your Units</CardTitle>
                        <CardDescription>A list of all your units and their current rental status.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Property</TableHead>
                            <TableHead>Unit Name</TableHead>
                            <TableHead>Unit Type</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {properties.map(propData => (
                                propData.units.map(unit => (
                                    <TableRow key={`${propData.property.id}-${unit.name}`}>
                                        <TableCell className="font-medium">{propData.property.name}</TableCell>
                                        <TableCell>{unit.name}</TableCell>
                                        <TableCell>{unit.unitType}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={unit.status === 'vacant' ? 'secondary' : 'default'} className="capitalize">
                                                {unit.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ))}
                        </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
