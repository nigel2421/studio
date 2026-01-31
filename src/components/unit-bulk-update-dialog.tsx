
'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Unit, unitStatuses, unitTypes, ownershipTypes, managementStatuses, handoverStatuses, unitOrientations } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BulkUnitUpdateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: Partial<Omit<Unit, 'name'>>) => Promise<void>;
    unitCount: number;
}

type UpdatableUnitField = keyof Pick<Unit, 'status' | 'ownership' | 'unitType' | 'unitOrientation' | 'managementStatus' | 'handoverStatus' | 'rentAmount' | 'serviceCharge'>;


const updatableFields: UpdatableUnitField[] = [
    'status', 'ownership', 'unitType', 'unitOrientation', 'managementStatus', 'handoverStatus', 'rentAmount', 'serviceCharge'
];

export function BulkUnitUpdateDialog({ open, onOpenChange, onSave, unitCount }: BulkUnitUpdateDialogProps) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const { control, handleSubmit, register, reset, getValues, setValue } = useForm();
    const [activeFields, setActiveFields] = useState<Partial<Record<UpdatableUnitField, boolean>>>({});
    
    useEffect(() => {
        if (!open) {
            reset();
            setActiveFields({});
        }
    }, [open, reset]);

    const handleToggleField = (field: UpdatableUnitField, checked: boolean) => {
        setActiveFields(prev => ({ ...prev, [field]: checked }));
        if (!checked) {
            setValue(field, '');
        }
    };

    const processSubmit = async (data: any) => {
        const updateData: Partial<Omit<Unit, 'name'>> = {};
        let hasActiveField = false;

        for (const key in activeFields) {
            const fieldKey = key as UpdatableUnitField;
            if (activeFields[fieldKey]) {
                hasActiveField = true;
                let value = data[fieldKey];
                
                if (fieldKey === 'rentAmount' || fieldKey === 'serviceCharge') {
                    value = value !== '' && !isNaN(value) ? Number(value) : undefined;
                }
                
                if (value !== undefined && value !== '' && value !== null) {
                    (updateData as any)[fieldKey] = value;
                }
            }
        }
        
        if (!hasActiveField || Object.keys(updateData).length === 0) {
            toast({
                variant: 'destructive',
                title: 'No Changes',
                description: 'Please select and fill at least one field to update.',
            });
            return;
        }

        setIsSaving(true);
        try {
            await onSave(updateData);
            onOpenChange(false);
        } finally {
            setIsSaving(false);
        }
    };

    const renderFieldInput = (field: UpdatableUnitField) => {
        const isDisabled = !activeFields[field];

        switch (field) {
            case 'status':
                return (
                    <Controller
                        name="status"
                        control={control}
                        defaultValue=""
                        render={({ field: controllerField }) => (
                            <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={isDisabled}>
                                <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                                <SelectContent>{unitStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        )}
                    />
                );
            case 'ownership':
                return (
                     <Controller
                        name="ownership"
                        control={control}
                        defaultValue=""
                        render={({ field: controllerField }) => (
                            <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={isDisabled}>
                                <SelectTrigger><SelectValue placeholder="Select Ownership" /></SelectTrigger>
                                <SelectContent>{ownershipTypes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        )}
                    />
                );
            case 'unitType':
                 return (
                     <Controller
                        name="unitType"
                        control={control}
                        defaultValue=""
                        render={({ field: controllerField }) => (
                            <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={isDisabled}>
                                <SelectTrigger><SelectValue placeholder="Select Unit Type" /></SelectTrigger>
                                <SelectContent>{unitTypes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        )}
                    />
                );
            case 'unitOrientation':
                 return (
                     <Controller
                        name="unitOrientation"
                        control={control}
                        defaultValue=""
                        render={({ field: controllerField }) => (
                            <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={isDisabled}>
                                <SelectTrigger><SelectValue placeholder="Select Orientation" /></SelectTrigger>
                                <SelectContent>{unitOrientations.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        )}
                    />
                );
            case 'managementStatus':
                 return (
                     <Controller
                        name="managementStatus"
                        control={control}
                        defaultValue=""
                        render={({ field: controllerField }) => (
                            <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={isDisabled}>
                                <SelectTrigger><SelectValue placeholder="Select Management Status" /></SelectTrigger>
                                <SelectContent>{managementStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        )}
                    />
                );
            case 'handoverStatus':
                 return (
                     <Controller
                        name="handoverStatus"
                        control={control}
                        defaultValue=""
                        render={({ field: controllerField }) => (
                            <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={isDisabled}>
                                <SelectTrigger><SelectValue placeholder="Select Handover Status" /></SelectTrigger>
                                <SelectContent>{handoverStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        )}
                    />
                );
            case 'rentAmount':
            case 'serviceCharge':
                return <Input type="number" {...register(field)} disabled={isDisabled} placeholder="Enter new value" />;
            default:
                return null;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Bulk Edit Units</DialogTitle>
                    <DialogDescription>
                        You are editing {unitCount} units. Select the fields you want to change and provide the new values.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(processSubmit)} className="space-y-4 py-4">
                    {updatableFields.map(field => (
                        <div key={field} className="grid grid-cols-[auto,1fr] items-center gap-4">
                             <Checkbox
                                id={`cb-${field}`}
                                onCheckedChange={(checked) => handleToggleField(field, !!checked)}
                            />
                            <div className="grid w-full items-center gap-1.5">
                                <Label htmlFor={field} className="capitalize text-sm font-medium">
                                    {field.replace(/([A-Z])/g, ' $1')}
                                </Label>
                                {renderFieldInput(field)}
                            </div>
                        </div>
                    ))}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Apply Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
