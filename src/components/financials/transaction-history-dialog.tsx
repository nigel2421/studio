
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, FileText, PlusCircle } from 'lucide-react';
import { Tenant, Payment, Property } from '@/lib/types';
import { getPaymentHistory } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { AddPaymentDialog } from './add-payment-dialog';
import { format } from 'date-fns';

interface TransactionHistoryDialogProps {
    tenant: Tenant | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPaymentAdded: () => void;
    allTenants: Tenant[];
    allProperties: Property[];
}

export function TransactionHistoryDialog({ tenant, open, onOpenChange, onPaymentAdded, allProperties, allTenants }: TransactionHistoryDialogProps) {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (tenant && open) {
            setIsLoading(true);
            getPaymentHistory(tenant.id)
                .then(setPayments)
                .catch(console.error)
                .finally(() => setIsLoading(false));
        }
    }, [tenant, open]);
    
    // This effect runs when onPaymentAdded is called from the inner dialog
    useEffect(() => {
        if (tenant && open) {
            getPaymentHistory(tenant.id).then(setPayments);
        }
    }, [tenant, open, onPaymentAdded]);


    const handleDownloadPDF = async () => {
        if (!tenant) return;
        const { generateTenantStatementPDF } = await import('@/lib/pdf-generator');
        generateTenantStatementPDF(tenant, payments);
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
                    <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={payments.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Export PDF
                    </Button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto border rounded-md">
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
                                    <TableHead>Rent For</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.length > 0 ? (
                                    payments.map((payment) => (
                                        <TableRow key={payment.id}>
                                            <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                                            <TableCell>{payment.type || 'Rent'}</TableCell>
                                            <TableCell>
                                                {payment.rentForMonth ? format(new Date(payment.rentForMonth + '-02'), 'MMM yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell className={`font-medium ${payment.type === 'Adjustment' && payment.amount < 0 ? 'text-green-600' : payment.type === 'Adjustment' && payment.amount > 0 ? 'text-red-600' : ''}`}>
                                                Ksh {payment.amount.toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={payment.status === 'Failed' ? 'destructive' : payment.status === 'Paid' ? 'default' : 'secondary'}>
                                                    {payment.status || 'Paid'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{payment.notes}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No transaction history found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
