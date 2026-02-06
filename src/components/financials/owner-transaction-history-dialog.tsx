'use client';

import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, Mail, Edit2 } from 'lucide-react';
import { Tenant, Payment, Property, Landlord, PropertyOwner, Unit, LedgerEntry, WaterMeterReading } from '@/lib/types';
import { format } from 'date-fns';
import { StatementOptionsDialog } from './statement-options-dialog';
import { generateOwnerServiceChargeStatementPDF } from '@/lib/pdf-generator';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';
import { performSendServiceChargeInvoice } from '@/app/actions';
import { InvoicePreviewDialog } from './invoice-preview-dialog';
import { generateLedger } from '@/lib/financial-logic';
import { useAuth } from '@/hooks/useAuth';
import { EditPaymentDialog, EditFormValues } from './edit-payment-dialog';
import { getPaymentHistory, updatePayment, forceRecalculateTenantBalance, getTenantWaterReadings, getAllWaterReadings } from '@/lib/data';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';


interface OwnerTransactionHistoryDialogProps {
    owner: PropertyOwner | Landlord | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    allProperties: Property[];
    allTenants: Tenant[];
    allPayments: Payment[];
    selectedMonth: Date;
    paymentStatusForMonth: 'Paid' | 'Pending' | 'N/A' | null;
    onDataChange?: () => void;
}

export function OwnerTransactionHistoryDialog({ owner, open, onOpenChange, allProperties, allTenants, allPayments, selectedMonth, paymentStatusForMonth, onDataChange }: OwnerTransactionHistoryDialogProps) {
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [finalDueBalance, setFinalDueBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isStatementOptionsOpen, setIsStatementOptionsOpen] = useState(false);
    const { startLoading: startPdfLoading, stopLoading: stopPdfLoading, isLoading: isPdfGenerating } = useLoading();
    const { toast } = useToast();
    const [isSending, setIsSending] = useState(false);
    const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);

    const { userProfile } = useAuth();
    const [selectedPaymentForEdit, setSelectedPaymentForEdit] = useState<Payment | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [tenantPayments, setTenantPayments] = useState<Payment[]>([]);

    useEffect(() => {
        if (!owner || !open) return;

        setIsLoading(true);

        const fetchLedger = async () => {
            const associatedTenants = (owner?.userId 
                ? allTenants.filter(t => t.residentType === 'Homeowner' && t.userId === owner.userId) 
                : allTenants.filter(t => t.residentType === 'Homeowner' && t.email === owner.email)
            );
            const uniqueTenants = Array.from(new Map(associatedTenants.map(t => [t.id, t])).values());
            
            let primaryTenant: Tenant | undefined = uniqueTenants[0];
    
            if (uniqueTenants.length > 0) {
                const associatedTenantIds = uniqueTenants.map(t => t.id);
                const [paymentsQuery, waterQuery] = await Promise.all([
                    getDocs(query(collection(db, 'payments'), where('tenantId', 'in', associatedTenantIds))),
                    getDocs(query(collection(db, 'waterReadings'), where('tenantId', 'in', associatedTenantIds)))
                ]);
                const currentTenantPayments = paymentsQuery.docs.map(d => ({ id: d.id, ...d.data() }) as Payment);
                const currentTenantWaterReadings = waterQuery.docs.map(d => ({ id: d.id, ...d.data() }) as WaterMeterReading);

                setTenantPayments(currentTenantPayments);
    
                const { ledger: generatedLedger, finalDueBalance: dueBalance } = generateLedger(primaryTenant!, currentTenantPayments, allProperties, currentTenantWaterReadings, owner, undefined, { includeWater: false });
                
                setLedger(generatedLedger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                setFinalDueBalance(dueBalance);
            } else {
                const dummyTenant: Tenant = {
                    id: `dummy-${owner.id}`,
                    name: owner.name,
                    email: owner.email,
                    phone: owner.phone,
                    idNumber: 'N/A',
                    residentType: 'Homeowner',
                    lease: { startDate: '2000-01-01', endDate: '2099-12-31', rent: 0, paymentStatus: 'Pending' },
                    propertyId: '', unitName: '', agent: 'Susan', status: 'active', securityDeposit: 0, waterDeposit: 0, accountBalance: 0, dueBalance: 0
                };
                primaryTenant = dummyTenant;
                const { ledger: generatedLedger, finalDueBalance: dueBalance } = generateLedger(dummyTenant, [], allProperties, [], owner, undefined, { includeWater: false });
                setLedger(generatedLedger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                setFinalDueBalance(dueBalance);
            }
            setIsLoading(false);
        }

        fetchLedger();

    }, [owner, open, allTenants, allProperties, allPayments]);
    

    const handleEditClick = (paymentId: string) => {
        const payment = tenantPayments.find(p => p.id === paymentId);
        if (payment) {
            setSelectedPaymentForEdit(payment);
            setIsEditDialogOpen(true);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not find the original payment record to edit.' });
        }
    };
    
    const handleSaveEdit = async (paymentId: string, data: EditFormValues) => {
        if (!userProfile?.id || !owner) return;

        const tenant = allTenants.find(t => t.residentType === 'Homeowner' && (t.userId === owner.userId || t.email === owner.email));
        if (!tenant) {
            toast({ variant: "destructive", title: "Error", description: "Associated resident account not found for balance recalculation."});
            return;
        }

        await updatePayment(paymentId, { amount: data.amount, date: format(data.date, 'yyyy-MM-dd'), notes: data.notes }, data.reason, userProfile.id);
        await forceRecalculateTenantBalance(tenant.id);
        toast({ title: "Payment Updated", description: "The transaction has been successfully updated."});
        if (onDataChange) {
            onDataChange();
        }
    };

    const handleOpenInvoicePreview = () => {
        if (!finalDueBalance || finalDueBalance <= 0) {
            toast({ variant: 'default', title: 'No Balance Due', description: `There is no outstanding balance to invoice.` });
            return;
        }
        setIsInvoicePreviewOpen(true);
    };

    const handleConfirmAndSend = async () => {
        if (!owner) return;
    
        setIsSending(true);
        try {
            const invoiceDetails = {
                month: 'Outstanding Service Charges',
                items: ledger.filter(i => i.charge > 0 && new Date(i.date) <= selectedMonth).map(i => ({ description: i.description, amount: i.charge })),
                totalDue: finalDueBalance,
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
            generateOwnerServiceChargeStatementPDF(entity, allProperties, allTenants, allPayments, await getAllWaterReadings(), startDate, endDate);
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

    const invoiceItemsForPreview = ledger
        .filter(entry => entry.charge > 0 && new Date(entry.date) <= new Date())
        .slice(-5) // show last 5 charges
        .map(entry => ({ description: entry.description, amount: entry.charge }));


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
                                        <TableHead>For Month</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Charge</TableHead>
                                        <TableHead className="text-right">Payment</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ledger.map((t, index) => (
                                        <TableRow key={`${t.id}-${index}`}>
                                            <TableCell>{format(new Date(t.date), 'dd MMM yyyy')}</TableCell>
                                            <TableCell>{t.forMonth}</TableCell>
                                            <TableCell>{t.description}</TableCell>
                                            <TableCell className="text-right text-red-600">{t.charge > 0 ? `Ksh ${t.charge.toLocaleString()}` : '-'}</TableCell>
                                            <TableCell className="text-right text-green-600">{t.payment > 0 ? `Ksh ${t.payment.toLocaleString()}` : '-'}</TableCell>
                                            <TableCell className="text-right font-bold">
                                                {t.balance < 0
                                                    ? <span className="text-green-600">Ksh {Math.abs(t.balance).toLocaleString()} Cr</span>
                                                    : `Ksh ${t.balance.toLocaleString()}`
                                                }
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {!t.id.startsWith('charge-') && (
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditClick(t.id)}>
                                                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                        {ledger.length === 0 && !isLoading && (
                             <div className="flex justify-center items-center h-full text-muted-foreground">
                                No transactions found for this owner.
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                        <Button onClick={handleOpenInvoicePreview} disabled={isSending}>
                            <Mail className="mr-2 h-4 w-4" />
                            Send Invoice
                        </Button>
                        <Button onClick={() => setIsStatementOptionsOpen(true)}>
                            <Download className="mr-2 h-4 w-4" />
                            Export PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
             <EditPaymentDialog 
                payment={selectedPaymentForEdit}
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                onSave={handleSaveEdit}
            />
            <InvoicePreviewDialog
                isOpen={isInvoicePreviewOpen}
                onClose={() => setIsInvoicePreviewOpen(false)}
                ownerName={owner.name}
                month={format(selectedMonth, 'MMMM yyyy')}
                items={invoiceItemsForPreview}
                totalDue={finalDueBalance}
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
