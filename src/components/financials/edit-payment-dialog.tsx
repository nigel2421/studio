'use client';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { Payment } from '@/lib/types';
import { format, parseISO } from 'date-fns';

const editSchema = z.object({
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
    date: z.date({ required_error: "Payment date is required."}),
    notes: z.string().optional(),
    reason: z.string().min(5, "Please provide a reason for this change."),
});

export type EditFormValues = z.infer<typeof editSchema>;

interface EditPaymentDialogProps {
    payment: Payment | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (paymentId: string, data: EditFormValues) => Promise<void>;
}

export function EditPaymentDialog({ payment, open, onOpenChange, onSave }: EditPaymentDialogProps) {
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<EditFormValues>({
        resolver: zodResolver(editSchema),
    });

    useEffect(() => {
        if (payment && open) {
            form.reset({
                amount: payment.amount,
                date: parseISO(payment.date),
                notes: payment.notes || '',
                reason: '',
            });
        }
    }, [payment, open, form]);

    const handleSubmit = async (data: EditFormValues) => {
        if (!payment) return;
        setIsSaving(true);
        try {
            await onSave(payment.id, data);
            onOpenChange(false);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Payment Record</DialogTitle>
                    <DialogDescription>Modify the payment details below. All changes will be logged.</DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                     <div className="grid grid-cols-2 gap-4">
                        <Controller control={form.control} name="amount" render={({ field, fieldState }) => (
                            <div><Label>Amount (Ksh)</Label><Input type="number" {...field} /><p className="text-red-500 text-xs mt-1">{fieldState.error?.message}</p></div>
                        )}/>
                        <Controller control={form.control} name="date" render={({ field, fieldState }) => (
                            <div className="flex flex-col gap-2"><Label>Payment Date</Label><DatePicker value={field.value} onChange={field.onChange} /><p className="text-red-500 text-xs">{fieldState.error?.message}</p></div>
                        )}/>
                     </div>
                     <Controller control={form.control} name="notes" render={({ field, fieldState }) => (
                        <div><Label>Notes (Optional)</Label><Input {...field} /><p className="text-red-500 text-xs mt-1">{fieldState.error?.message}</p></div>
                     )}/>
                     <Controller control={form.control} name="reason" render={({ field, fieldState }) => (
                        <div><Label>Reason for Edit</Label><Textarea {...field} placeholder="e.g., Corrected wrong amount entered." /><p className="text-red-500 text-xs mt-1">{fieldState.error?.message}</p></div>
                     )}/>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
