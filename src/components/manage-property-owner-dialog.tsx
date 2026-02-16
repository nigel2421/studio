
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Property, PropertyOwner, Unit } from '@/lib/types';
import { useLoading } from '@/hooks/useLoading';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    owner?: PropertyOwner | null;
    property: Property;
    allOwners: PropertyOwner[];
    onSave: (ownerData: PropertyOwner, selectedUnitNames: string[]) => Promise<void>;
}

export function ManagePropertyOwnerDialog({ isOpen, onClose, owner, property, allOwners, onSave }: Props) {
    const [formData, setFormData] = useState<PropertyOwner>({
        id: '',
        name: '',
        email: '',
        phone: '',
        bankAccount: '',
        assignedUnits: [],
    });
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const { startLoading, stopLoading, isLoading } = useLoading();
    const { toast } = useToast();

    useEffect(() => {
        if (isOpen) {
            if (owner) {
                setFormData(owner);
                const unitsForThisProperty = owner.assignedUnits?.find(au => au.propertyId === property.id)?.unitNames || [];
                setSelectedUnits(unitsForThisProperty);
            } else {
                setFormData({
                    id: `owner-${property.id}-${Date.now()}`,
                    name: '',
                    email: '',
                    phone: '',
                    bankAccount: '',
                    assignedUnits: [],
                });
                setSelectedUnits([]);
            }
        }
    }, [owner, property, isOpen]);

    const handleUnitToggle = (unitName: string) => {
        setSelectedUnits(prev =>
            prev.includes(unitName)
                ? prev.filter(name => name !== unitName)
                : [...prev, unitName]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name.length > 100) {
            toast({
                variant: "destructive",
                title: "Name Too Long",
                description: "The owner name cannot exceed 100 characters.",
            });
            return;
        }
        startLoading('Saving Property Owner Details...');
        try {
            await onSave(formData, selectedUnits);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            stopLoading();
        }
    };

    const clientUnits = property.units.filter(u =>
        u.ownership === 'Landlord'
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{owner?.name ? 'Edit' : 'Add'} Property Owner</DialogTitle>
                    <DialogDescription>
                        Manage contact information for &quot;{property.name}&quot; owners.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                maxLength={100}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="bankAccount">Bank Account (Optional)</Label>
                            <Input
                                id="bankAccount"
                                value={formData.bankAccount || ''}
                                onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label>Assigned Client-Owned Units</Label>
                        <ScrollArea className="h-[120px] pr-4 border rounded-md p-2">
                            {clientUnits.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {clientUnits.map((unit) => {
                                        const assignedOwner = allOwners.find(o =>
                                            o.id !== owner?.id &&
                                            o.assignedUnits?.some(au =>
                                                au.propertyId === property.id && au.unitNames.includes(unit.name)
                                            )
                                        );
                                        const isDisabled = !!assignedOwner;

                                        return (
                                            <div key={unit.name} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`unit-${unit.name}`}
                                                    checked={selectedUnits.includes(unit.name)}
                                                    onCheckedChange={() => handleUnitToggle(unit.name)}
                                                    disabled={isDisabled}
                                                />
                                                <label
                                                    htmlFor={`unit-${unit.name}`}
                                                    className={cn(
                                                        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                                                        isDisabled && "text-muted-foreground"
                                                    )}
                                                >
                                                    {unit.name}
                                                    {assignedOwner && <span className="text-xs"> ({assignedOwner.name})</span>}
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">No units matching client-managed criteria found.</p>
                            )}
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={isLoading}>Save Details</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
