'use client';

import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download } from 'lucide-react';
import { Tenant, Payment, Property, Landlord, PropertyOwner } from '@/lib/types';
import { format, isWithinInterval, startOfMonth, addMonths, isBefore, isAfter } from 'date-fns';
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
}

export function OwnerTransactionHistoryDialog({ owner, open, onOpenChange, allProperties, allTenants, allPayments }: OwnerTransactionHistoryDialogProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStatementOptionsOpen, setIsStatementOptionsOpen] = useState(false);
    const { startLoading: startPdfLoading, stopLoading: stopPdfLoading, isLoading: isPdfGenerating } = useLoading();
    const { toast } = useToast();

    useEffect(() => {
        if (owner && open) {
            setIsLoading(true);
            
            const ownerUnits = allProperties.flatMap(p =>
                (p.units || [])
                 .filter(u =>
                    ('assignedUnits' in owner && owner.assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name))) ||
                    (!('assignedUnits' in owner) && u.landlordId === owner.id)
                  )
                 .map(u => ({...u, propertyId: p.id, propertyName: p.name}))
            );

            const monthlyCharges = new Map<string, { totalAmount: number; unitNames: string[] }>();

            // Generate charges based on all of the owner's units and their specific handover dates.
            ownerUnits.forEach(unit => {
                const tenant = allTenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name && t.residentType === 'Homeowner');
                const monthlyCharge = unit.serviceCharge || 0;
                
                if (monthlyCharge <= 0) return;

                let firstBillableMonth: Date;

                if (tenant?.lease.lastBilledPeriod) {
                    const lastBilledDate = startOfMonth(new Date(tenant.lease.lastBilledPeriod + '-02'));
                    firstBillableMonth = addMonths(lastBilledDate, 1);
                } else if (unit.handoverStatus === 'Handed Over' && unit.handoverDate) {
                    const handoverDate = new Date(unit.handoverDate);
                    const handoverDay = handoverDate.getDate();
                    if (handoverDay <= 10) {
                        firstBillableMonth = startOfMonth(handoverDate);
                    } else {
                        firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
                    }
                } else {
                    return; // Cannot determine billing start
                }
                
                let loopDate = firstBillableMonth;
                const today = new Date();
                
                while (loopDate <= today) {
                    const monthKey = format(loopDate, 'yyyy-MM');
                    if (!monthlyCharges.has(monthKey)) {
                        monthlyCharges.set(monthKey, { totalAmount: 0, unitNames: [] });
                    }
                    const chargeForMonth = monthlyCharges.get(monthKey)!;
                    chargeForMonth.totalAmount += monthlyCharge;

                    if (!chargeForMonth.unitNames.includes(unit.name)) {
                        chargeForMonth.unitNames.push(unit.name);
                    }
                    
                    loopDate = addMonths(loopDate, 1);
                }
            });

            const aggregatedCharges = Array.from(monthlyCharges.entries()).map(([monthKey, data]) => {
                const unitList = data.unitNames.sort().join(', ');
                return {
                    date: new Date(monthKey + '-01T12:00:00Z'),
                    transactionType: 'Invoice',
                    details: `S.Charge for Units: ${unitList}`,
                    charge: data.totalAmount,
                    payment: 0,
                };
            });

            const ownerUnitIdentifiers = new Set(ownerUnits.map(u => `${u.propertyId}-${u.name}`));
            const relevantTenants = allTenants.filter(t => ownerUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
            const relevantTenantIds = relevantTenants.map(t => t.id);

            const serviceChargePayments = allPayments.filter(p =>
                relevantTenantIds.includes(p.tenantId) &&
                (p.type === 'ServiceCharge' || p.type === 'Rent')
            );
            
            const combined = [
                 ...serviceChargePayments.map(p => ({
                    date: new Date(p.date),
                    transactionType: 'Payment Received',
                    details: p.notes || `Payment for ${p.rentForMonth ? format(new Date(p.rentForMonth + '-02'), 'MMM yyyy') : p.type}`,
                    charge: 0,
                    payment: p.amount,
                })),
                ...aggregatedCharges
            ].sort((a, b) => {
                const dateDiff = a.date.getTime() - b.date.getTime();
                if (dateDiff !== 0) return dateDiff;
                // If on the same day, charges should come before payments
                if (a.charge > 0 && b.payment > 0) return -1;
                if (a.payment > 0 && b.charge > 0) return 1;
                return 0;
            });

            let runningBalance = 0;
            const ledger: Transaction[] = combined.map(item => {
                runningBalance += item.charge;
                runningBalance -= item.payment;
                return { ...item, balance: runningBalance };
            });

            setTransactions(ledger.reverse()); // Show newest first
            setIsLoading(false);
        }
    }, [owner, open, allProperties, allTenants, allPayments]);

    const handleGenerateStatement = async (landlord: Landlord | PropertyOwner, startDate: Date, endDate: Date) => {
        startPdfLoading('Generating Statement...');
        try {
            if ('assignedUnits' in landlord) {
                 generateOwnerServiceChargeStatementPDF(landlord, allProperties, allTenants, allPayments, startDate, endDate);
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
                 generateOwnerServiceChargeStatementPDF(landlordAsOwner, allProperties, allTenants, allPayments, startDate, endDate);
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
                            A consolidated view of all charges and payments for this owner's units.
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
                                        <TableRow key={index}>
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
            />
        </>
    );
}
