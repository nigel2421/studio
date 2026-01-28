'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, PlusCircle } from 'lucide-react';
import { Tenant, Payment, Property, LedgerEntry } from '@/lib/types';
import { getPaymentHistory } from '@/lib/data';
import { AddPaymentDialog } from './add-payment-dialog';
import { format, startOfMonth, addMonths } from 'date-fns';
import { PaginationControls } from '@/components/ui/pagination-controls';

interface TransactionHistoryDialogProps {
    tenant: Tenant | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPaymentAdded: () => void;
    allTenants: Tenant[];
    allProperties: Property[];
}

export function TransactionHistoryDialog({ tenant, open, onOpenChange, onPaymentAdded, allProperties, allTenants }: TransactionHistoryDialogProps) {
    const [ledger, setLedger] = useState<{ id: string, date: string; description: string; charge: number; payment: number; balance: number }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        if (tenant && open) {
            setIsLoading(true);
            getPaymentHistory(tenant.id)
                .then(paymentHistory => {
                    const property = allProperties.find(p => p.id === tenant.propertyId);
                    const unit = property?.units.find(u => u.name === tenant.unitName);
                    
                    const monthlyCharge = tenant.residentType === 'Homeowner' 
                        ? (unit?.serviceCharge || tenant.lease.serviceCharge || 0) 
                        : (tenant.lease.rent || 0);

                    // Generate monthly charges
                    let generatedCharges: { date: string, description: string, amount: number }[] = [];
                    if (monthlyCharge > 0) {
                        const handoverDate = unit?.handoverDate ? new Date(unit.handoverDate) : null;
                        const leaseStartDate = new Date(tenant.lease.startDate);
                        
                        const billingStartDate = tenant.residentType === 'Homeowner' && handoverDate
                            ? startOfMonth(addMonths(handoverDate, 1))
                            : startOfMonth(leaseStartDate);

                        let loopDate = billingStartDate;
                        const today = new Date();
                        while (loopDate <= today) {
                            generatedCharges.push({
                                date: loopDate.toISOString(),
                                description: `${tenant.residentType === 'Homeowner' ? 'Service Charge' : 'Rent'} for ${format(loopDate, 'MMMM yyyy')}`,
                                amount: monthlyCharge
                            });
                            loopDate = addMonths(loopDate, 1);
                        }
                    }

                    // Combine payments and charges into a unified list
                    const combined = [
                        ...paymentHistory.map(p => {
                            const isAdjustment = p.type === 'Adjustment';
                            return {
                                id: p.id,
                                date: new Date(p.date),
                                description: p.notes || `Payment - ${p.rentForMonth ? format(new Date(p.rentForMonth + '-02'), 'MMM yyyy') : p.type}`,
                                charge: isAdjustment && p.amount > 0 ? p.amount : 0, // Debits are charges
                                payment: !isAdjustment ? p.amount : (isAdjustment && p.amount < 0 ? Math.abs(p.amount) : 0), // Credits are payments
                            };
                        }),
                        ...generatedCharges.map((c, i) => ({
                            id: `charge-${i}`,
                            date: new Date(c.date),
                            description: c.description,
                            charge: c.amount,
                            payment: 0
                        }))
                    ].sort((a, b) => {
                        const dateDiff = a.date.getTime() - b.date.getTime();
                        if (dateDiff !== 0) return dateDiff;
                        // If dates are same, charges (debits) should come before payments (credits)
                        if (a.charge > 0 && b.payment > 0) return -1;
                        if (a.payment > 0 && b.charge > 0) return 1;
                        return 0;
                    });

                    // Calculate opening balance
                    const netChangeInPeriod = combined.reduce((sum, item) => sum + item.charge - item.payment, 0);
                    const openingBalance = (tenant.dueBalance || 0) - netChangeInPeriod;

                    // Calculate running balance
                    let runningBalance = openingBalance;
                    const ledgerWithBalance = combined.map(item => {
                        runningBalance += (item.charge - item.payment);
                        return { ...item, date: format(item.date, 'yyyy-MM-dd'), balance: runningBalance };
                    });

                    // Display oldest first for a standard ledger view
                    setLedger(ledgerWithBalance);
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
                                    paginatedLedger.map((entry, index) => (
                                        <TableRow key={`${entry.id}-${index}`}>
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
