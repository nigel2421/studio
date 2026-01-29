'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AccountInfo {
    unitName: string;
    unitServiceCharge: number;
}

interface ConfirmOwnerPaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    ownerName: string;
    accounts: AccountInfo[];
    onConfirm: (paymentData: { amount: number; date: Date; notes: string; forMonth: string }) => void;
    isSaving: boolean;
}

const monthOptions = Array.from({ length: 18 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i + 2);
    return {
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy'),
    };
});

export function ConfirmOwnerPaymentDialog({
    isOpen,
    onClose,
    ownerName,
    accounts,
    onConfirm,
    isSaving,
}: ConfirmOwnerPaymentDialogProps) {
    const totalDue = useMemo(() => accounts.reduce((sum, acc) => sum + acc.unitServiceCharge, 0), [accounts]);
    const [amount, setAmount] = useState<string>('');
    const [date, setDate] = useState<Date>(new Date());
    const [forMonth, setForMonth] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            setAmount(totalDue.toString());
            setDate(new Date());
            setForMonth(format(new Date(), 'yyyy-MM'));
        }
    }, [isOpen, totalDue]);

    const handleSubmit = () => {
        if (Number(amount) > 0 && forMonth) {
            onConfirm({ amount: Number(amount), date, notes: '', forMonth });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Confirm Payment for {ownerName}</DialogTitle>
                    <DialogDescription>
                        A total of {accounts.length} unit(s) have pending service charges.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="p-4 rounded-lg bg-muted border">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-muted-foreground">Total Amount Due</span>
                            <span className="text-lg font-bold">Ksh {totalDue.toLocaleString()}</span>
                        </div>
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
                    <div className="space-y-2">
                        <Label htmlFor="for-month">Payment for Month</Label>
                        <Select value={forMonth} onValueChange={setForMonth}>
                            <SelectTrigger id="for-month">
                                <SelectValue placeholder="Select month..." />
                            </SelectTrigger>
                            <SelectContent>
                                {monthOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSaving || !amount || !forMonth}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Record Payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
