
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, PlusCircle, Edit2 } from 'lucide-react';
import { Tenant, Payment, Property, LedgerEntry, WaterMeterReading } from '@/lib/types';
import { getPaymentHistory, updatePayment, forceRecalculateTenantBalance, getTenantWaterReadings } from '@/lib/data';
import { AddPaymentDialog } from './add-payment-dialog';
import { format } from 'date-fns';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { generateLedger } from '@/lib/financial-logic';
import { useAuth } from '@/hooks/useAuth';
import { EditPaymentDialog, EditFormValues } from './edit-payment-dialog';
import { useToast } from '@/hooks/use-toast';

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
    const [pageSize, setPageSize] = useState(10);
    const { userProfile } = useAuth();
    const { toast } = useToast();

    const [selectedPaymentForEdit, setSelectedPaymentForEdit] = useState<Payment | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [allTenantPayments, setAllTenantPayments] = useState<Payment[]>([]);

    const fetchAndSetLedger = useCallback(async () => {
        if (tenant && open) {
            setIsLoading(true);
            try {
                // Rent module should not show water bills, so we don't fetch/pass them
                const payments = await getPaymentHistory(tenant.id);
                setAllTenantPayments(payments); 
                const { ledger: generatedLedger } = generateLedger(tenant, payments, allProperties, [], undefined, undefined, { includeWater: false });
                setLedger(generatedLedger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            } catch (error) {
                console.error("Failed to generate ledger:", error);
            } finally {
                setIsLoading(false);
            }
        }
    }, [tenant, open, allProperties]);

    useEffect(() => {
        fetchAndSetLedger();
    }, [fetchAndSetLedger, onPaymentAdded]);

    const handleEditClick = (paymentId: string) => {
        const payment = allTenantPayments.find(p => p.id === paymentId);
        if (payment) {
            setSelectedPaymentForEdit(payment);
            setIsEditDialogOpen(true);
        } else {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not find the original payment record to edit."
            });
        }
    };
    
    const handleSaveEdit = async (paymentId: string, data: EditFormValues) => {
        if (!userProfile?.id || !tenant?.id) {
             toast({ variant: "destructive", title: "Authentication Error", description: "Could not identify the editor."});
             return;
        }
        
        await updatePayment(
            paymentId,
            { amount: data.amount, date: format(data.date, 'yyyy-MM-dd'), notes: data.notes },
            data.reason,
            userProfile.id
        );
        
        await forceRecalculateTenantBalance(tenant.id);
        
        toast({ title: "Payment Updated", description: "The transaction has been successfully updated."});
        
        onPaymentAdded();
    };

    const totalPages = Math.ceil(ledger.length / pageSize);
    const paginatedLedger = ledger.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const handleDownloadPDF = async () => {
        if (!tenant) return;
        const { generateTenantStatementPDF } = await import('@/lib/pdf-generator');
        const fullPaymentHistory = await getPaymentHistory(tenant.id);
        const waterReadings = await getTenantWaterReadings(tenant.id);
        generateTenantStatementPDF(tenant, fullPaymentHistory, allProperties, waterReadings);
    };

    if (!tenant) return null;

    return (
        <>
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
                        <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
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
                                        <TableHead>For Month</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Charge</TableHead>
                                        <TableHead className="text-right">Payment</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead className="w-[50px]"> </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedLedger.length > 0 ? (
                                        paginatedLedger.map((entry, index) => (
                                            <TableRow key={`${entry.id}-${index}`}>
                                                <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                                                <TableCell>{entry.forMonth}</TableCell>
                                                <TableCell>{entry.description}</TableCell>
                                                <TableCell className="text-right text-red-600 font-medium">
                                                    {entry.charge > 0 ? `Ksh ${entry.charge.toLocaleString()}`: '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-green-600 font-medium">
                                                    {entry.payment > 0 ? `Ksh ${entry.payment.toLocaleString()}` : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-bold">
                                                    {entry.balance < 0
                                                        ? <span className="text-green-600">Ksh {Math.abs(entry.balance).toLocaleString()} Cr</span>
                                                        : `Ksh ${entry.balance.toLocaleString()}`
                                                    }
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {!entry.id.startsWith('charge-') && (
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditClick(entry.id)}>
                                                            <Edit2 className="h-4 w-4 text-muted-foreground" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
            <EditPaymentDialog 
                payment={selectedPaymentForEdit}
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                onSave={handleSaveEdit}
            />
        </>
    );
}
