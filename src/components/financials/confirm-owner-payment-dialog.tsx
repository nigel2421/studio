'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, parseISO, addMonths } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Payment, paymentMethods } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';

interface AccountInfo {
    unitName: string;
    unitServiceCharge: number;
}

interface ConfirmOwnerPaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    ownerName: string;
    accounts: AccountInfo[];
    onConfirm: (paymentData: { amount: number; date: Date; notes: string; forMonth: string; paymentMethod: Payment['paymentMethod']; transactionId: string; }) => void;
    isSaving: boolean;
    totalBalanceDue: number;
}

const monthOptions = Array.from({ length: 6 }, (_, i) => { // show 6 months: this month, past 5
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return {
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy'),
    };
}).reverse(); // oldest first


export function ConfirmOwnerPaymentDialog({
    isOpen,
    onClose,
    ownerName,
    accounts,
    onConfirm,
    isSaving,
    totalBalanceDue,
}: ConfirmOwnerPaymentDialogProps) {
    const [amount, setAmount] = useState<string>('');
    const [date, setDate] = useState<Date>(new Date());
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<Payment['paymentMethod']>('M-Pesa');
    const [transactionId, setTransactionId] = useState('');

    useEffect(() => {
        if (isOpen) {
            setAmount(totalBalanceDue.toString());
            setDate(new Date());
            setSelectedMonths([format(new Date(), 'yyyy-MM')]);
            setPaymentMethod('M-Pesa');
            setTransactionId('');
        }
    }, [isOpen, totalBalanceDue]);
    
    const handleMonthToggle = (monthValue: string) => {
        setSelectedMonths(prev =>
            prev.includes(monthValue)
                ? prev.filter(m => m !== monthValue)
                : [...prev, monthValue]
        );
    };

    const handleSubmit = () => {
        if (Number(amount) > 0 && selectedMonths.length > 0 && transactionId) {
            const sortedMonths = [...selectedMonths].sort();
            const notes = `Consolidated service charge payment for ${sortedMonths.map(m => format(parseISO(m + '-02'), 'MMM yyyy')).join(', ')}.`;
            const forMonth = sortedMonths[sortedMonths.length - 1]; // Use the latest selected month for the main record
            onConfirm({ amount: Number(amount), date, notes, forMonth, paymentMethod, transactionId });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Confirm Payment for {ownerName}</DialogTitle>
                    <DialogDescription>
                        A total of {accounts.length} unit(s) have pending service charges for the selected month.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="p-4 rounded-lg bg-muted border">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-muted-foreground">Total Amount Due</span>
                            <span className="text-lg font-bold">Ksh {totalBalanceDue.toLocaleString()}</span>
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
                             <DatePicker id="payment-date" value={date} onChange={(d) => {if(d) setDate(d)}} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Payment for Months</Label>
                        <div className="grid grid-cols-2 gap-2 rounded-md border p-4">
                            {monthOptions.map(option => (
                                <div key={option.value} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`month-${option.value}`}
                                        checked={selectedMonths.includes(option.value)}
                                        onCheckedChange={() => handleMonthToggle(option.value)}
                                    />
                                    <label
                                        htmlFor={`month-${option.value}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {option.label}
                                    </label>
                                </div>
                            ))}
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
                    <Button onClick={handleSubmit} disabled={isSaving || !amount || selectedMonths.length === 0 || !transactionId}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Record Payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}