'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, PlusCircle } from 'lucide-react';
import { Tenant, Payment, Property } from '@/lib/types';
import { getPaymentHistory } from '@/lib/data';
import { AddPaymentDialog } from './add-payment-dialog';
import { format, startOfMonth, addMonths } from 'date-fns';
import { PaginationControls } from '@/components/ui/pagination-controls';

interface LedgerEntry {
    id: string;
    date: string;
    description: string;
    charge: number;
    payment: number;
    balance: number;
}

interface TransactionHistoryDialogProps {
    tenant: Tenant | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPaymentAdded: () => void;
    allTenants: Tenant[];
    allProperties: Property[];
}

export function TransactionHistoryDialog({ tenant, open, onOpenChange, onPaymentAdded, allProperties, allTenants }: TransactionHistoryDialogProps) {
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    useEffect(() => {
        if (tenant && open) {
            setIsLoading(true);
            getPaymentHistory(tenant.id)
                .then(async (paymentHistory) => {
                    const property = allProperties.find(p => p.id === tenant.propertyId);
                    const unit = property?.units.find(u => u.name === tenant.unitName);
                    const monthlyCharge = tenant.residentType === 'Homeowner' 
                        ? (unit?.serviceCharge || tenant.lease.serviceCharge || 0) 
                        : (tenant.lease.rent || 0);
                    const chargeLabel = tenant.residentType === 'Homeowner' ? 'Service Charge' : 'Rent';

                    const ledgerItems: { date: Date; description: string; amount: number; id: string }[] = [];

                    // 1. Add payments to ledger as negative amounts
                    paymentHistory.forEach(p => {
                        ledgerItems.push({
                            id: p.id,
                            date: new Date(p.date),
                            description: p.notes || `Payment - ${p.type}`,
                            amount: p.type === 'Adjustment' ? p.amount : -p.amount,
                        });
                    });

                    // 2. Add monthly charges to ledger as positive amounts
                    if (monthlyCharge > 0) {
                        const handoverDate = unit?.handoverDate ? new Date(unit.handoverDate) : null;
                        const leaseStartDate = new Date(tenant.lease.startDate);
                        const billingStartDate = tenant.residentType === 'Homeowner' && handoverDate
                            ? startOfMonth(addMonths(handoverDate, 1))
                            : startOfMonth(leaseStartDate);
                        
                        let loopDate = billingStartDate;
                        const today = new Date();
                        while (loopDate <= today) {
                            ledgerItems.push({
                                id: `charge-${format(loopDate, 'yyyy-MM')}`,
                                date: loopDate,
                                description: `${chargeLabel} for ${format(loopDate, 'MMMM yyyy')}`,
                                amount: monthlyCharge,
                            });
                            loopDate = addMonths(loopDate, 1);
                        }
                    }

                    // 3. Sort all ledger items chronologically
                    ledgerItems.sort((a, b) => a.date.getTime() - b.date.getTime());

                    // 4. Calculate opening balance to reconcile with current dueBalance
                    const netChange = ledgerItems.reduce((sum, item) => sum + item.amount, 0);
                    const openingBalance = (tenant.dueBalance || 0) - netChange;
                    
                    // 5. Build final ledger with a running balance
                    let runningBalance = openingBalance;
                    const finalLedger: LedgerEntry[] = ledgerItems.map(item => {
                        runningBalance += item.amount;
                        return {
                            id: item.id,
                            date: format(item.date, 'yyyy-MM-dd'),
                            description: item.description,
                            charge: item.amount > 0 ? item.amount : 0,
                            payment: item.amount < 0 ? -item.amount : 0,
                            balance: runningBalance,
                        };
                    });

                    // Reverse for newest-first display in the UI
                    setLedger(finalLedger.reverse());
                })
                .catch(console.error)
                .finally(() => setIsLoading(false));
            setCurrentPage(1);
        }
    }, [tenant, open, onPaymentAdded, allProperties]);
    

    const totalPages = Math.ceil(ledger.length / pageSize);
    const paginatedLedger = ledger.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const handleDownloadPDF = async () => {
        if (!tenant) return;
        const { generateTenantStatementPDF } = await import('@/lib/pdf-generator');
        const fullPaymentHistory = await getPaymentHistory(tenant.id);
        generateTenantStatementPDF(tenant, fullPaymentHistory, allProperties);
    };

    if (!tenant) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Transaction History</DialogTitle>
                    <DialogDescription>
                        Financial record for {tenant.name} (Unit: {tenant.unitName})
                    </DialogDescription>
                </DialogHeader>

                <div className="flex justify-between items-center mb-4">
                     <AddPaymentDialog
                        properties={allProperties}
                        tenants={allTenants}
                        onPaymentAdded={onPaymentAdded}
                        tenant={tenant}
                    >
                        <Button variant="outline" size="sm">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Record Payment
                        </Button>
                    </AddPaymentDialog>
                    <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={ledger.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Export PDF
                    </Button>
                </div>

                <div className="border rounded-md">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
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
                                {paginatedLedger.length > 0 ? (
                                    paginatedLedger.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                                            <TableCell>{entry.description}</TableCell>
                                            <TableCell className="text-right text-red-600 font-medium">
                                                {entry.charge > 0 ? `Ksh ${entry.charge.toLocaleString()}`: '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-green-600 font-medium">
                                                {entry.payment > 0 ? `Ksh ${entry.payment.toLocaleString()}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                Ksh {entry.balance.toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            No transaction history found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>
                 {ledger.length > 0 && (
                    <div className="pt-4 border-t">
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalItems={ledger.length}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(size) => {
                                setPageSize(size);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}