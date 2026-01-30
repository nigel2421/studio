'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface InvoicePreviewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    ownerName: string;
    month: string;
    items: { description: string; amount: number }[];
    totalDue: number;
    onConfirm: () => void;
    isSending: boolean;
}

export function InvoicePreviewDialog({
    isOpen,
    onClose,
    ownerName,
    month,
    items,
    totalDue,
    onConfirm,
    isSending,
}: InvoicePreviewDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Invoice Preview</DialogTitle>
                    <DialogDescription>
                        This is a preview of the invoice that will be sent to {ownerName}.
                    </DialogDescription>
                </DialogHeader>
                <div className="border rounded-lg p-6 my-4 bg-muted/20">
                    <h3 className="font-bold text-lg">Service Charge Invoice</h3>
                    <p className="text-sm text-muted-foreground">For {month}</p>
                    <div className="my-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.description}</TableCell>
                                        <TableCell className="text-right">Ksh {item.amount.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="font-bold bg-muted/50">
                                    <TableCell>Total Amount Due</TableCell>
                                    <TableCell className="text-right">Ksh {totalDue.toLocaleString()}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSending}>Cancel</Button>
                    <Button onClick={onConfirm} disabled={isSending}>
                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirm & Send
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
