'use client';

import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, Mail } from 'lucide-react';
import { Tenant, Payment, Property, Landlord, PropertyOwner, Unit, LedgerEntry } from '@/lib/types';
import { format } from 'date-fns';
import { StatementOptionsDialog } from './statement-options-dialog';
import { generateOwnerServiceChargeStatementPDF } from '@/lib/pdf-generator';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';
import { performSendServiceChargeInvoice } from '@/app/actions';
import { InvoicePreviewDialog } from './invoice-preview-dialog';
import { generateLedger } from '@/lib/financial-logic';

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
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [finalDueBalance, setFinalDueBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isStatementOptionsOpen, setIsStatementOptionsOpen] = useState(false);
    const { startLoading: startPdfLoading, stopLoading: stopPdfLoading, isLoading: isPdfGenerating } = useLoading();
    const { toast } = useToast();
    const [isSending, setIsSending] = useState(false);
    const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);

    const associatedTenant = useMemo(() => {
        if (!owner) return null;
        // Prioritize finding by userId if available
        if (owner.userId) {
            const tenantByUserId = allTenants.find(t => t.residentType === 'Homeowner' && t.userId === owner.userId);
            if(tenantByUserId) return tenantByUserId;
        }
        // Fallback to email
        return allTenants.find(t => 
            t.residentType === 'Homeowner' && t.email === owner.email
        );
    }, [owner, allTenants]);
    
    useEffect(() => {
        if (owner && open && associatedTenant) {
            setIsLoading(true);
            const tenantPayments = allPayments.filter(p => p.tenantId === associatedTenant.id);
            const { ledger: generatedLedger, finalDueBalance: dueBalance } = generateLedger(associatedTenant, tenantPayments, allProperties, owner);
            
            const sortedLedger = generatedLedger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            setLedger(sortedLedger);
            setFinalDueBalance(dueBalance);
            setIsLoading(false);
        } else if (owner && open && !associatedTenant) {
            // Handle case where a homeowner exists but has no matching proxy 'tenant' record yet
            setLedger([]);
            setFinalDueBalance(0);
            setIsLoading(false);
            console.warn(`No associated homeowner tenant record found for owner ${owner.name}.`);
        }
    }, [owner, open, associatedTenant, allPayments, allProperties]);
    

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
            generateOwnerServiceChargeStatementPDF(entity, allProperties, allTenants, allPayments, startDate, endDate);
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
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Charge</TableHead>
                                        <TableHead className="text-right">Payment</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ledger.map((t, index) => (
                                        <TableRow key={`${t.id}-${index}`}>
                                            <TableCell>{format(new Date(t.date), 'dd MMM yyyy')}</TableCell>
                                            <TableCell>{t.description}</TableCell>
                                            <TableCell className="text-right text-red-600">{t.charge > 0 ? `Ksh ${t.charge.toLocaleString()}` : '-'}</TableCell>
                                            <TableCell className="text-right text-green-600">{t.payment > 0 ? `Ksh ${t.payment.toLocaleString()}` : '-'}</TableCell>
                                            <TableCell className="text-right font-bold">
                                                {t.balance < 0
                                                    ? <span className="text-green-600">Ksh {Math.abs(t.balance).toLocaleString()} Cr</span>
                                                    : `Ksh ${t.balance.toLocaleString()}`
                                                }
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
