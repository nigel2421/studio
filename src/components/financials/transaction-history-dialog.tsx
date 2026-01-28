
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, PlusCircle } from 'lucide-react';
import { Tenant, Payment, Property } from '@/lib/types';
import { getPaymentHistory } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { AddPaymentDialog } from './add-payment-dialog';
import { format, startOfMonth, addMonths } from 'date-fns';
import { PaginationControls } from '@/components/ui/pagination-controls';

interface LedgerEntry {
    id: string;
    date: string;
    type: Payment['type'] | 'Charge';
    rentForMonth: string;
    amount: number;
    status: 'Paid' | 'Pending';
    notes?: string;
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
                    const chargeLabel = tenant.residentType === 'Homeowner' ? 'ServiceCharge' : 'Rent';
                    
                    const ledgerItems: { date: Date; description: string; amount: number; type: 'Charge' | Payment['type']; rentForMonth: string; }[] = [];

                    // Add payments as negative amounts
                    paymentHistory.forEach(p => {
                        ledgerItems.push({
                            date: new Date(p.date),
                            description: p.notes || `Payment Received - ${p.type}`,
                            amount: p.type === 'Adjustment' ? p.amount : -p.amount,
                            type: p.type,
                            rentForMonth: p.rentForMonth || format(new Date(p.date), 'yyyy-MM')
                        });
                    });

                    // Add all historical charges as positive amounts
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
                                date: loopDate,
                                description: `${chargeLabel} for ${format(loopDate, 'MMMM yyyy')}`,
                                amount: monthlyCharge,
                                type: 'Charge',
                                rentForMonth: format(loopDate, 'yyyy-MM')
                            });
                            loopDate = addMonths(loopDate, 1);
                        }
                    }
                    
                    ledgerItems.sort((a, b) => a.date.getTime() - b.date.getTime());
                    
                    const netChangeInLedger = ledgerItems.reduce((sum, item) => sum + item.amount, 0);
                    const openingBalance = (tenant.dueBalance || 0) - netChangeInLedger;

                    let runningBalance = openingBalance;
                    const finalLedger: LedgerEntry[] = [];

                    // Create a map to track paid months
                    const paidMonths = new Set<string>();
                    paymentHistory.forEach(p => {
                        if (p.rentForMonth && (p.type === 'Rent' || p.type === 'ServiceCharge')) {
                            paidMonths.add(p.rentForMonth);
                        }
                    });

                    // Add pending charges to display
                    ledgerItems.filter(item => item.type === 'Charge').forEach(charge => {
                        if (!paidMonths.has(charge.rentForMonth)) {
                            finalLedger.push({
                                id: `charge-${charge.rentForMonth}`,
                                date: charge.date.toISOString(),
                                type: chargeLabel as Payment['type'],
                                rentForMonth: charge.rentForMonth,
                                amount: charge.amount,
                                status: 'Pending',
                                notes: 'Outstanding balance for this period.',
                            });
                        }
                    });

                    // Add payments to display
                    paymentHistory.forEach(payment => {
                        finalLedger.push({
                            id: payment.id,
                            date: payment.date,
                            type: payment.type,
                            rentForMonth: payment.rentForMonth || '',
                            amount: payment.amount,
                            status: 'Paid',
                            notes: payment.notes,
                        });
                    });

                    finalLedger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    setLedger(finalLedger);
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
        // We need to fetch the original full payment history for the PDF, not the mixed ledger
        const fullPaymentHistory = await getPaymentHistory(tenant.id);
        generateTenantStatementPDF(tenant, fullPaymentHistory, allProperties);
    };

    if (!tenant) return null;

    const chargeOrRentLabel = tenant?.residentType === 'Homeowner' ? 'Service Charge For' : 'Rent For';

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
                                    <TableHead>Type</TableHead>
                                    <TableHead>{chargeOrRentLabel}</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedLedger.length > 0 ? (
                                    paginatedLedger.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                                            <TableCell>{entry.type || 'Rent'}</TableCell>
                                            <TableCell>
                                                {entry.rentForMonth ? format(new Date(entry.rentForMonth + '-02'), 'MMM yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell className={`font-medium ${entry.type === 'Adjustment' && entry.amount < 0 ? 'text-green-600' : entry.type === 'Adjustment' && entry.amount > 0 ? 'text-red-600' : ''}`}>
                                                Ksh {entry.amount.toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={entry.status === 'Pending' ? 'destructive' : entry.status === 'Paid' ? 'default' : 'secondary'}>
                                                    {entry.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{entry.notes}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No transaction history or pending charges found.
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

