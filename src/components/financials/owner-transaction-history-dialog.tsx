'use client';

import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, Mail } from 'lucide-react';
import { Tenant, Payment, Property, Landlord, PropertyOwner, Unit } from '@/lib/types';
import { format, isWithinInterval, startOfMonth, addMonths, isBefore, isAfter, isSameMonth, endOfMonth, isValid } from 'date-fns';
import { StatementOptionsDialog } from './statement-options-dialog';
import { generateOwnerServiceChargeStatementPDF } from '@/lib/pdf-generator';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';
import { performSendServiceChargeInvoice } from '@/app/actions';
import { InvoicePreviewDialog } from './invoice-preview-dialog';

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
    const [invoiceItems, setInvoiceItems] = useState<{ description: string; amount: number }[]>([]);
    const [totalDueForInvoice, setTotalDueForInvoice] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isStatementOptionsOpen, setIsStatementOptionsOpen] = useState(false);
    const { startLoading: startPdfLoading, stopLoading: stopPdfLoading, isLoading: isPdfGenerating } = useLoading();
    const { toast } = useToast();
    const [isSending, setIsSending] = useState(false);
    const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);

    useEffect(() => {
        if (owner && open && selectedMonth) {
            setIsLoading(true);

            const ownerUnits: Unit[] = allProperties.flatMap(p =>
                (p.units || []).filter(u => {
                    const isDirectlyAssigned = u.landlordId === owner.id;
                    const isAssignedViaOwnerObject = 'assignedUnits' in owner && owner.assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name));
                    return isDirectlyAssigned || isAssignedViaOwnerObject;
                }).map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
            );

            const allHistoricalTransactions: { date: Date, details: string, charge: number, payment: number }[] = [];
            
            const relevantTenants = allTenants.filter(t => 
                t.residentType === 'Homeowner' &&
                ownerUnits.some(u => u.propertyId === t.propertyId && t.unitName === t.unitName)
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
                let firstBillableMonth: Date | null = null;

                // Priority: Handover Date > Lease Start Date. Ignore lastBilledPeriod for historical accuracy.
                if (unit.handoverStatus === 'Handed Over' && unit.handoverDate) {
                    const effectiveDate = new Date(unit.handoverDate);
                    if (isValid(effectiveDate)) {
                        const handoverDay = effectiveDate.getDate();
                        // Handover on/before 10th waives current month, billing starts next.
                        // Handover after 10th waives next month, billing starts month after.
                        firstBillableMonth = handoverDay <= 10 ? startOfMonth(addMonths(effectiveDate, 1)) : startOfMonth(addMonths(effectiveDate, 2));
                    }
                }
                else if (tenant?.lease.startDate) {
                     const effectiveDate = new Date(tenant.lease.startDate);
                     if (isValid(effectiveDate)) {
                         firstBillableMonth = startOfMonth(effectiveDate);
                     }
                }
            
                if (firstBillableMonth) {
                    let loopDate = firstBillableMonth;
                    const endOfPeriod = endOfMonth(selectedMonth);
                    while (loopDate <= endOfPeriod) {
                        allHistoricalTransactions.push({
                            date: loopDate,
                            details: `S.Charge for Unit ${unit.name}`,
                            charge: monthlyCharge,
                            payment: 0,
                        });
                        loopDate = addMonths(loopDate, 1);
                    }
                }
            });
            
            const endOfSelectedMonth = endOfMonth(selectedMonth);
            const transactionsToProcess = allHistoricalTransactions.filter(t => t.date <= endOfSelectedMonth);

            const groupedCharges = transactionsToProcess
                .filter(t => t.charge > 0)
                .reduce((acc, t) => {
                    const monthKey = format(t.date, 'yyyy-MM');
                    if (!acc[monthKey]) {
                        acc[monthKey] = { date: t.date, totalCharge: 0, unitNames: new Set<string>() };
                    }
                    acc[monthKey].totalCharge += t.charge;
                    const unitMatch = t.details.match(/Unit (.*)/);
                    if (unitMatch && unitMatch[1]) {
                        acc[monthKey].unitNames.add(unitMatch[1]);
                    }
                    return acc;
                }, {} as Record<string, { date: Date; totalCharge: number; unitNames: Set<string> }>);

            const chargeItems = Object.values(groupedCharges).map(group => ({
                date: group.date,
                details: `Service Charge for ${format(group.date, 'MMMM yyyy')}`,
                charge: group.totalCharge,
                payment: 0,
            }));

            const groupedPayments = transactionsToProcess
                .filter(t => t.payment > 0)
                .reduce((acc, t) => {
                    const dateKey = format(t.date, 'yyyy-MM-dd');
                    if (!acc[dateKey]) {
                        acc[dateKey] = { date: t.date, totalPayment: 0 };
                    }
                    acc[dateKey].totalPayment += t.payment;
                    return acc;
                }, {} as Record<string, { date: Date; totalPayment: number }>);
            
            const paymentItems = Object.values(groupedPayments).map(group => ({
                date: group.date,
                details: 'Payment Received',
                charge: 0,
                payment: group.totalPayment,
            }));

            const combinedItems = [...chargeItems, ...paymentItems].sort((a, b) => {
                const dateDiff = a.date.getTime() - b.date.getTime();
                if (dateDiff !== 0) return dateDiff;
                // Prioritize charges over payments on the same day
                if (a.charge > 0 && b.payment > 0) return -1;
                if (a.payment > 0 && b.charge > 0) return 1;
                return 0;
            });
            
            let runningBalance = 0;
            const ledger: Transaction[] = combinedItems.map(item => {
                runningBalance += item.charge;
                runningBalance -= item.payment;
                return {
                    date: item.date,
                    transactionType: item.charge > 0 ? 'Invoice' : 'Payment',
                    details: item.details,
                    charge: item.charge,
                    payment: item.payment,
                    balance: runningBalance
                };
            });
            
            setTransactions(ledger);

            const finalBalance = ledger.length > 0 ? ledger[ledger.length - 1].balance : 0;
            let lastZeroBalanceIndex = -1;
            for (let i = ledger.length - 1; i >= 0; i--) {
                if (ledger[i].balance <= 0) {
                    lastZeroBalanceIndex = i;
                    break;
                }
            }
            const outstandingCharges = ledger
                .slice(lastZeroBalanceIndex + 1)
                .filter(entry => entry.charge > 0)
                .map(entry => ({ description: entry.details, amount: entry.charge }));

            setInvoiceItems(outstandingCharges);
            setTotalDueForInvoice(finalBalance);

            setIsLoading(false);
        }
    }, [owner, open, selectedMonth, paymentStatusForMonth, allProperties, allTenants, allPayments]);

    const handleOpenInvoicePreview = () => {
        setIsInvoicePreviewOpen(true);
    };

    const handleConfirmAndSend = async () => {
        if (!owner) return;
    
        setIsSending(true);
        try {
            if (totalDueForInvoice <= 0) {
                 toast({ variant: 'default', title: 'No Balance Due', description: `There is no outstanding balance to invoice for this month.` });
                 setIsInvoicePreviewOpen(false);
                 return;
            }

            const invoiceDetails = {
                month: 'Outstanding Service Charges',
                items: invoiceItems,
                totalDue: totalDueForInvoice,
            };

            if (!owner.email) {
                throw new Error("Owner does not have a registered email address.");
            }
    
            const result = await performSendServiceChargeInvoice(
                owner.id,
                owner.email,
                owner.name,
                invoiceDetails,
                owner
            );
    
            if (result.success) {
                toast({ title: 'Invoice Sent', description: `An invoice has been emailed to ${owner.name}.` });
                setIsInvoicePreviewOpen(false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
    
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to send invoice.' });
        } finally {
            setIsSending(false);
        }
    };

    const handleGenerateStatement = async (entity: Landlord | PropertyOwner, startDate: Date, endDate: Date) => {
        startPdfLoading('Generating Statement...');
        try {
            if ('assignedUnits' in entity) {
                 generateOwnerServiceChargeStatementPDF(entity, allProperties, allTenants, allPayments, startDate, endDate);
            } else {
                const landlordAsOwner: PropertyOwner = {
                    ...entity,
                    assignedUnits: allProperties.reduce((acc, p) => {
                        const unitsForLandlord = (p.units || []).filter(u => u.landlordId === entity.id).map(u => u.name);
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
                           Statement as of {selectedMonth && format(selectedMonth, 'MMMM yyyy')}
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
                        {paymentStatusForMonth === 'Pending' && (
                             <Button onClick={handleOpenInvoicePreview} disabled={isSending}>
                                <Mail className="mr-2 h-4 w-4" />
                                Send Invoice
                            </Button>
                        )}
                        <Button onClick={() => setIsStatementOptionsOpen(true)}>
                            <Download className="mr-2 h-4 w-4" />
                            Export PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <InvoicePreviewDialog
                isOpen={isInvoicePreviewOpen}
                onClose={() => setIsInvoicePreviewOpen(false)}
                ownerName={owner.name}
                month={format(selectedMonth, 'MMMM yyyy')}
                items={invoiceItems}
                totalDue={totalDueForInvoice}
                onConfirm={handleConfirmAndSend}
                isSending={isSending}
            />
            <StatementOptionsDialog
                isOpen={isStatementOptionsOpen}
                onClose={() => setIsStatementOptionsOpen(false)}
                entity={owner}
                onGenerate={handleGenerateStatement as any}
                isGenerating={isPdfGenerating}
            />
        </>
    );
}
