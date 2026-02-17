
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Banknote, Wallet, Building2, TrendingUp, Download, Coins } from 'lucide-react';
import { Payment, Property, Tenant, Unit } from '@/lib/types';
import { FinancialSummary } from '@/lib/financial-utils';
import { downloadCSV } from '@/lib/utils';
import { Button } from '../ui/button';

interface LandlordDashboardContentProps {
    properties: Property[];
    financialSummary: FinancialSummary;
    displayTransactions: any[];
    totalUnits: number;
}

export function LandlordDashboardContent({ properties, financialSummary, displayTransactions, totalUnits }: LandlordDashboardContentProps) {

    const serviceChargeLabel = totalUnits > 1 ? 'Service Charges (from Occupied Units)' : 'Service Charges';

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
                        <div className="text-2xl font-bold">Ksh {financialSummary.totalRent.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total gross rent from payments</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium">{serviceChargeLabel}</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {financialSummary.totalServiceCharges.toLocaleString()}</div>
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
                        <div className="text-2xl font-bold">Ksh {financialSummary.totalManagementFees.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Agency fee on rent</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium">Other Costs</CardTitle>
                        <Coins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Ksh {financialSummary.totalOtherCosts.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Transaction fees</p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-primary">Net Rent Payout</CardTitle>
                        <Wallet className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">Ksh {(financialSummary.totalNetRemittance).toLocaleString()}</div>
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
                                <TableCell className="text-right font-bold">Ksh {financialSummary.totalRent.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-muted-foreground">- {financialSummary.totalServiceCharges.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-muted-foreground">- {financialSummary.totalManagementFees.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-muted-foreground">- {financialSummary.totalOtherCosts.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold">Ksh {financialSummary.totalNetRemittance.toLocaleString()}</TableCell>
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
                                (propData.units || []).map(unit => (
                                    <TableRow key={`${propData.id}-${unit.name}`}>
                                        <TableCell className="font-medium">{propData.name}</TableCell>
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
