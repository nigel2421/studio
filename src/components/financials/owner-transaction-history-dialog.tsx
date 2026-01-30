'use client';

import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download } from 'lucide-react';
import { Tenant, Payment, Property, Landlord, PropertyOwner, Unit } from '@/lib/types';
import { format, isWithinInterval, startOfMonth, addMonths, isBefore, isAfter, isSameMonth } from 'date-fns';
import { StatementOptionsDialog } from './statement-options-dialog';
import { generateOwnerServiceChargeStatementPDF } from '@/lib/pdf-generator';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';

interface Transaction {
    date: Date;
    transactionType: string;
    details: string;
    charge: number;
    payment: number;
    balance: number;
}

interface OwnerTransactionHistoryDialogProps {
    owner: PropertyOwner | Landlord | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    allProperties: Property[];
    allTenants: Tenant[];
    allPayments: Payment[];
    selectedMonth: Date;
    paymentStatusForMonth: 'Paid' | 'Pending' | 'N/A' | null;
}

export function OwnerTransactionHistoryDialog({ owner, open, onOpenChange, allProperties, allTenants, allPayments, selectedMonth, paymentStatusForMonth }: OwnerTransactionHistoryDialogProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStatementOptionsOpen, setIsStatementOptionsOpen] = useState(false);
    const { startLoading: startPdfLoading, stopLoading: stopPdfLoading, isLoading: isPdfGenerating } = useLoading();
    const { toast } = useToast();

    useEffect(() => {
        if (owner && open && selectedMonth) {
            setIsLoading(true);

            // 1. Identify all units belonging to this owner
            const ownerUnits: Unit[] = allProperties.flatMap(p =>
                (p.units || [])
                    .filter(u =>
                        ('assignedUnits' in owner && owner.assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name))) ||
                        (!('assignedUnits' in owner) && u.landlordId === owner.id)
                    )
                    .map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
            );

            // 2. Collect all historical charges and payments for these units
            const allHistoricalTransactions: { date: Date, details: string, charge: number, payment: number }[] = [];
            
            const relevantTenants = allTenants.filter(t => 
                t.residentType === 'Homeowner' &&
                ownerUnits.some(u => u.propertyId === t.propertyId && u.name === t.unitName)
            );
            const relevantTenantIds = relevantTenants.map(t => t.id);
            const allOwnerPayments = allPayments.filter(p => relevantTenantIds.includes(p.tenantId));

            allOwnerPayments.forEach(p => {
                allHistoricalTransactions.push({
                    date: new Date(p.date),
                    details: p.notes || `Payment - ${p.rentForMonth ? format(new Date(p.rentForMonth + '-02'), 'MMM yyyy') : p.type}`,
                    charge: 0,
                    payment: p.amount
                });
            });

            ownerUnits.forEach(unit => {
                const monthlyCharge = unit.serviceCharge || 0;
                if (monthlyCharge <= 0) return;

                const tenant = relevantTenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name);

                let firstBillableMonth: Date;
                if (tenant?.lease.lastBilledPeriod && tenant.lease.lastBilledPeriod.trim() !== '') {
                     firstBillableMonth = startOfMonth(addMonths(new Date(tenant.lease.lastBilledPeriod + '-02'), 1));
                } else if (unit.handoverStatus === 'Handed Over' && unit.handoverDate) {
                    const handoverDate = new Date(unit.handoverDate);
                    const handoverDay = handoverDate.getDate();
                     if (handoverDay <= 10) {
                        firstBillableMonth = startOfMonth(handoverDate);
                    } else {
                        firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
                    }
                } else {
                    return; 
                }

                let loopDate = firstBillableMonth;
                const today = new Date();
                while (startOfMonth(loopDate) <= startOfMonth(today)) {
                    allHistoricalTransactions.push({
                        date: loopDate,
                        details: `S.Charge for Unit ${unit.name}`,
                        charge: monthlyCharge,
                        payment: 0,
                    });
                    loopDate = addMonths(loopDate, 1);
                }
            });

            // 3. Calculate Opening Balance
            const startOfSelectedMonth = startOfMonth(selectedMonth);
            let openingBalance = 0;
            allHistoricalTransactions.forEach(t => {
                if (isBefore(t.date, startOfSelectedMonth)) {
                    openingBalance += t.charge;
                    openingBalance -= t.payment;
                }
            });
            
            // 4. Filter for display month and build ledger from the opening balance
            const displayTransactions = allHistoricalTransactions.filter(t => isSameMonth(t.date, selectedMonth));
            const ledger: Transaction[] = [];
            let runningBalance = openingBalance;

            const groupedCharges = displayTransactions
                .filter(t => t.charge > 0)
                .reduce((acc, t) => {
                    const dateKey = format(t.date, 'yyyy-MM-dd');
                    if (!acc[dateKey]) {
                        acc[dateKey] = { date: t.date, totalCharge: 0, units: [] };
                    }
                    acc[dateKey].totalCharge += t.charge;
                    const unitMatch = t.details.match(/Unit (.*)/);
                    if (unitMatch && unitMatch[1] && !acc[dateKey].units.includes(unitMatch[1])) {
                        acc[dateKey].units.push(unitMatch[1]);
                    }
                    return acc;
                }, {} as Record<string, { date: Date; totalCharge: number; units: string[] }>);

            const combinedTransactionsForMonth = [
                ...Object.values(groupedCharges).map(group => ({
                    date: group.date,
                    details: `S.Charge for Units: ${group.units.sort().join(', ')}`,
                    charge: group.totalCharge,
                    payment: 0,
                })),
                ...displayTransactions.filter(t => t.payment > 0)
            ];

            if (paymentStatusForMonth === 'Paid') {
                const totalChargeForMonth = combinedTransactionsForMonth.reduce((sum, t) => sum + t.charge, 0);
                const hasPaymentRecord = combinedTransactionsForMonth.some(t => t.payment > 0);
                if (totalChargeForMonth > 0 && !hasPaymentRecord) {
                    combinedTransactionsForMonth.push({
                        date: startOfSelectedMonth,
                        details: 'Payment Received',
                        charge: 0,
                        payment: totalChargeForMonth,
                    });
                }
            }

            combinedTransactionsForMonth.sort((a, b) => {
                const dateDiff = a.date.getTime() - b.date.getTime();
                if (dateDiff !== 0) return dateDiff;
                if (a.charge > 0 && b.payment > 0) return -1;
                if (a.payment > 0 && b.charge > 0) return 1;
                return 0;
            }).forEach(item => {
                runningBalance += item.charge;
                runningBalance -= item.payment;
                ledger.push({
                    date: item.date,
                    transactionType: item.charge > 0 ? 'Invoice' : 'Payment',
                    details: item.details,
                    charge: item.charge,
                    payment: item.payment,
                    balance: runningBalance
                });
            });

            if (openingBalance > 0 && paymentStatusForMonth !== 'Pending') {
                 ledger.unshift({
                    date: startOfSelectedMonth,
                    transactionType: 'Opening Balance',
                    details: 'Balance Brought Forward',
                    charge: 0,
                    payment: 0,
                    balance: openingBalance,
                });
            }
            
            setTransactions(ledger);
            setIsLoading(false);
        }
    }, [owner, open, selectedMonth, paymentStatusForMonth, allProperties, allTenants, allPayments]);


    const handleGenerateStatement = async (landlord: Landlord | PropertyOwner, startDate: Date, endDate: Date, status: 'Paid' | 'Pending' | 'N/A' | null) => {
        startPdfLoading('Generating Statement...');
        try {
            if ('assignedUnits' in landlord) {
                 generateOwnerServiceChargeStatementPDF(landlord, allProperties, allTenants, allPayments, startDate, endDate, status);
            } else {
                const landlordAsOwner: PropertyOwner = {
                    ...landlord,
                    assignedUnits: allProperties.reduce((acc, p) => {
                        const unitsForLandlord = (p.units || []).filter(u => u.landlordId === landlord.id).map(u => u.name);
                        if (unitsForLandlord.length > 0) {
                            acc.push({propertyId: p.id, unitNames: unitsForLandlord});
                        }
                        return acc;
                    }, [] as {propertyId: string, unitNames: string[]}[])
                };
                 generateOwnerServiceChargeStatementPDF(landlordAsOwner, allProperties, allTenants, allPayments, startDate, endDate, status);
            }

            setIsStatementOptionsOpen(false);
            toast({ title: 'Statement Downloaded', description: 'Your PDF statement has been generated.' });
        } catch (error) {
            console.error("Error generating statement PDF:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not generate PDF statement.' });
        } finally {
            stopPdfLoading();
        }
    };

    if (!owner) return null;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Transaction History for {owner.name}</DialogTitle>
                        <DialogDescription>
                           Statement for {selectedMonth && format(selectedMonth, 'MMMM yyyy')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto border rounded-md">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Charge</TableHead>
                                        <TableHead className="text-right">Payment</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((t, index) => (
                                        <TableRow key={index} className={t.transactionType === 'Opening Balance' ? 'bg-muted/50' : ''}>
                                            <TableCell>{format(t.date, 'dd MMM yyyy')}</TableCell>
                                            <TableCell>{t.details}</TableCell>
                                            <TableCell className="text-right">{t.charge > 0 ? `Ksh ${t.charge.toLocaleString()}` : '-'}</TableCell>
                                            <TableCell className="text-right text-green-600">{t.payment > 0 ? `Ksh ${t.payment.toLocaleString()}` : '-'}</TableCell>
                                            <TableCell className="text-right font-bold">{`Ksh ${t.balance > 0 ? t.balance.toLocaleString() : '0.00'}`}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                        {transactions.length === 0 && !isLoading && (
                             <div className="flex justify-center items-center h-full text-muted-foreground">
                                No transactions found for this owner.
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                        <Button onClick={() => setIsStatementOptionsOpen(true)}>
                            <Download className="mr-2 h-4 w-4" />
                            Export PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <StatementOptionsDialog
                isOpen={isStatementOptionsOpen}
                onClose={() => setIsStatementOptionsOpen(false)}
                landlord={owner}
                onGenerate={handleGenerateStatement as any}
                isGenerating={isPdfGenerating}
                paymentStatusForMonth={paymentStatusForMonth}
            />
        </>
    );
}
