
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Payment, paymentMethods, WaterMeterReading, PropertyOwner, Landlord } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';

interface OwnerBill {
    owner: PropertyOwner | Landlord;
    readings: WaterMeterReading[];
    totalDue: number;
}

interface ConfirmOwnerWaterPaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    ownerBill: OwnerBill;
    onConfirm: (paymentData: { amount: number; date: Date; paymentMethod: Payment['paymentMethod']; transactionId: string; }) => void;
    isSaving: boolean;
}

export function ConfirmOwnerWaterPaymentDialog({
    isOpen,
    onClose,
    ownerBill,
    onConfirm,
    isSaving,
}: ConfirmOwnerWaterPaymentDialogProps) {
    const [amount, setAmount] = useState<string>('');
    const [date, setDate] = useState<Date>(new Date());
    const [paymentMethod, setPaymentMethod] = useState<Payment['paymentMethod']>('M-Pesa');
    const [transactionId, setTransactionId] = useState('');

    useEffect(() => {
        if (isOpen && ownerBill) {
            setAmount(ownerBill.totalDue.toString());
            setDate(new Date());
            setPaymentMethod('M-Pesa');
            setTransactionId('');
        }
    }, [isOpen, ownerBill]);
    
    const handleSubmit = () => {
        if (Number(amount) > 0 && transactionId) {
            onConfirm({ amount: Number(amount), date, paymentMethod, transactionId });
        }
    };

    if (!ownerBill) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle>Consolidated Water Payment</DialogTitle>
                    <DialogDescription>
                        Record a single payment for all pending water bills for {ownerBill.owner.name}.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="p-4 rounded-lg bg-muted border">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-muted-foreground">Total Amount Due</span>
                            <span className="text-lg font-bold">Ksh {ownerBill.totalDue.toLocaleString()}</span>
                        </div>
                        <ScrollArea className="h-24 mt-2">
                           <ul className="text-xs text-muted-foreground space-y-1">
                                {ownerBill.readings.map(r => (
                                    <li key={r.id} className="flex justify-between">
                                        <span>{r.unitName} ({format(new Date(r.date), 'MMM yyyy')})</span>
                                        <span>Ksh {r.amount.toLocaleString()}</span>
                                    </li>
                                ))}
                           </ul>
                        </ScrollArea>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount-paid">Amount Paid</Label>
                            <Input
                                id="amount-paid"
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payment-date">Payment Date</Label>
                             <DatePicker value={date} onChange={(d) => {if(d) setDate(d)}} />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="payment-method">Payment Method</Label>
                            <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as Payment['paymentMethod'])}>
                                <SelectTrigger id="payment-method">
                                    <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                                <SelectContent>
                                    {paymentMethods.map(method => (
                                        <SelectItem key={method} value={method}>{method}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="transaction-id">Transaction ID</Label>
                            <Input
                                id="transaction-id"
                                value={transactionId}
                                onChange={(e) => setTransactionId(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSaving || !amount || !transactionId}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Record Payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
