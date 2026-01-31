
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
    Unit, unitTypes, ownershipTypes, managementStatuses, unitOrientations
} from '@/lib/types';
import { Loader2 } from 'lucide-react';

const addUnitSchema = z.object({
    name: z.string().min(1, "Unit name is required."),
    unitType: z.enum(unitTypes, { required_error: "Unit type is required."}),
    ownership: z.enum(ownershipTypes),
    managementStatus: z.enum(managementStatuses).optional(),
    unitOrientation: z.enum(unitOrientations).optional(),
    rentAmount: z.coerce.number().optional(),
    serviceCharge: z.coerce.number().optional(),
});

type AddUnitFormValues = z.infer<typeof addUnitSchema>;

interface AddUnitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: AddUnitFormValues) => Promise<void>;
}

export function AddUnitDialog({ open, onOpenChange, onSave }: AddUnitDialogProps) {
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<AddUnitFormValues>({
        resolver: zodResolver(addUnitSchema),
        defaultValues: {
            name: '',
            unitType: 'Studio',
            ownership: 'SM',
            rentAmount: 0,
            serviceCharge: 0,
        },
    });

    useEffect(() => {
        if (!open) {
            form.reset();
        }
    }, [open, form]);

    const handleSubmit = async (data: AddUnitFormValues) => {
        setIsSaving(true);
        try {
            await onSave(data);
            onOpenChange(false);
        } catch (error) {
            console.error("Error saving new unit:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Unit</DialogTitle>
                    <DialogDescription>
                        Enter the details for the new unit.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Unit Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., A101" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="unitType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Unit Type</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                                            <SelectContent>{unitTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="ownership"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Ownership</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select ownership" /></SelectTrigger></FormControl>
                                            <SelectContent>{ownershipTypes.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <FormField
                                control={form.control}
                                name="managementStatus"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Mngmt Status</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                                            <SelectContent>{managementStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="unitOrientation"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Orientation</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select orientation" /></SelectTrigger></FormControl>
                                            <SelectContent>{unitOrientations.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="rentAmount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Rent (Ksh)</FormLabel>
                                        <FormControl><Input type="number" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="serviceCharge"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Service Charge (Ksh)</FormLabel>
                                        <FormControl><Input type="number" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Unit
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
