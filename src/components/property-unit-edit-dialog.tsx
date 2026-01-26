
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
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
    Unit, unitStatuses, unitTypes, ownershipTypes, managementStatuses, handoverStatuses, Landlord, UnitOrientation, unitOrientations
} from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

const unitSchema = z.object({
    name: z.string(),
    status: z.enum(unitStatuses as any),
    ownership: z.enum(ownershipTypes as any),
    unitType: z.enum(unitTypes as any),
    landlordId: z.string().optional(),
    managementStatus: z.enum(managementStatuses as any).optional(),
    handoverStatus: z.enum(handoverStatuses as any).optional(),
    handoverDate: z.date().optional(),
    rentAmount: z.coerce.number().optional(),
    serviceCharge: z.coerce.number().optional(),
    unitOrientation: z.enum(unitOrientations as [string, ...string[]]).optional(),
});

type UnitFormValues = z.infer<typeof unitSchema>;

interface UnitEditDialogProps {
    unit: Unit | null;
    landlords: Landlord[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: Unit) => Promise<void>;
}

export function UnitEditDialog({ unit, landlords, open, onOpenChange, onSave }: UnitEditDialogProps) {
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<UnitFormValues>({
        resolver: zodResolver(unitSchema),
        defaultValues: {
            name: '',
            status: 'vacant',
            ownership: 'SM',
            unitType: 'Studio',
            landlordId: '',
            managementStatus: undefined,
            handoverStatus: undefined,
            handoverDate: undefined,
            rentAmount: 0,
            serviceCharge: 0,
            unitOrientation: undefined,
        },
    });

    useEffect(() => {
        if (unit) {
            form.reset({
                ...unit,
                landlordId: unit.landlordId || 'none',
                rentAmount: unit.rentAmount || 0,
                serviceCharge: unit.serviceCharge || 0,
                handoverDate: unit.handoverDate ? new Date(unit.handoverDate) : undefined,
            });
        }
    }, [unit, form]);

    const handleSubmit = async (data: UnitFormValues) => {
        setIsSaving(true);
        try {
            const dataToSave: Partial<UnitFormValues> = { ...data };

            if (data.handoverStatus !== 'Handed Over') {
                dataToSave.handoverDate = undefined;
            }

            await onSave(dataToSave as Unit);
            onOpenChange(false);
        } catch (error) {
            console.error("Error saving unit:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>Edit Unit: {unit?.name}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Rental Status</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {unitStatuses.map((status) => (
                                                    <SelectItem key={status} value={status} className="capitalize">
                                                        {status}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="unitType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Unit Type</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {unitTypes.map((type) => (
                                                    <SelectItem key={type} value={type}>
                                                        {type}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
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
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {ownershipTypes.map((type) => (
                                                    <SelectItem key={type} value={type}>
                                                        {type}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {form.watch('ownership') === 'Landlord' && (
                                <FormField
                                    control={form.control}
                                    name="landlordId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Landlord</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Assign Landlord" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="none">None</SelectItem>
                                                    {landlords.map((landlord) => (
                                                        <SelectItem key={landlord.id} value={landlord.id}>
                                                            {landlord.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                             <FormField
                                control={form.control}
                                name="unitOrientation"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Unit Orientation</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select orientation" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {unitOrientations.map((orientation) => (
                                                    <SelectItem key={orientation} value={orientation}>
                                                        {orientation}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="managementStatus"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Management Status</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {managementStatuses.map((status) => (
                                                    <SelectItem key={status} value={status}>
                                                        {status}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="handoverStatus"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Handover Status</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {handoverStatuses.map((status) => (
                                                    <SelectItem key={status} value={status}>
                                                        {status}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             {form.watch('handoverStatus') === 'Handed Over' && (
                                <FormField
                                    control={form.control}
                                    name="handoverDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Handover Date</FormLabel>
                                             <FormControl>
                                                <DatePicker value={field.value} onChange={field.onChange} />
                                             </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <FormField
                                control={form.control}
                                name="rentAmount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Rent Amount (Ksh)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
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
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
