
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Landlord, Property, Unit } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { useLoading } from '@/hooks/useLoading';
import { cn } from '@/lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  landlord: Landlord | null;
  properties: Property[];
  allLandlords: Landlord[];
  onSave: (landlord: Landlord, selectedUnitNames: string[]) => Promise<void>;
}

export function ManageLandlordDialog({ isOpen, onClose, landlord, properties, allLandlords, onSave }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  
  const allLandlordOwnedUnits = useMemo(() => {
    return properties.flatMap(p => 
      p.units
        .filter(u => u.ownership === 'Landlord')
        .map(u => ({...u, propertyId: p.id, propertyName: p.name}))
    );
  }, [properties]);
  
  useEffect(() => {
    if (landlord) {
      setName(landlord.name || '');
      setEmail(landlord.email || '');
      setPhone(landlord.phone || '');
      setBankAccount(landlord.bankAccount || '');
      // Pre-select units already assigned to this landlord
      const currentlyAssigned = allLandlordOwnedUnits
        .filter(u => u.landlordId === landlord.id)
        .map(u => u.name);
      setSelectedUnits(currentlyAssigned);
    } else {
      // Reset for new landlord
      setName('');
      setEmail('');
      setPhone('');
      setBankAccount('');
      setSelectedUnits([]);
    }
  }, [landlord, allLandlordOwnedUnits]);

  const handleUnitToggle = (unitName: string) => {
    setSelectedUnits(prev =>
      prev.includes(unitName)
        ? prev.filter(name => name !== unitName)
        : [...prev, unitName]
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startLoading(landlord ? 'Updating Landlord...' : 'Adding Landlord...');
    try {
      const landlordData: Landlord = {
        id: landlord?.id || `landlord_${Date.now()}`,
        name,
        email,
        phone,
        bankAccount,
        userId: landlord?.userId
      };
      await onSave(landlordData, selectedUnits);
    } catch (error) {
      // Toast is handled in parent component
    } finally {
      stopLoading();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{landlord ? 'Edit' : 'Add'} Landlord</DialogTitle>
          <DialogDescription>
            {landlord ? 'Edit landlord details and unit assignments.' : 'Add a new landlord and assign their units.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="landlord-name">Full Name</Label>
                    <Input id="landlord-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="landlord-phone">Phone</Label>
                    <Input id="landlord-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
            </div>
             <div className="grid gap-2">
                <Label htmlFor="landlord-email">Email</Label>
                <Input id="landlord-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            <div className="grid gap-2">
              <Label htmlFor="bank-account">Bank Account Details</Label>
              <Input id="bank-account" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Assign Landlord Units</Label>
              <ScrollArea className="h-40 rounded-md border p-4">
                <div className="space-y-2">
                  {allLandlordOwnedUnits.map(unit => {
                    const isAssignedToOther = !!(unit.landlordId && landlord?.id !== unit.landlordId);
                    const otherLandlord = isAssignedToOther ? allLandlords.find(l => l.id === unit.landlordId) : null;
                    
                    return (
                        <div key={`${unit.propertyId}-${unit.name}`} className="flex items-center space-x-2">
                            <Checkbox
                                id={`unit-${unit.name}`}
                                checked={selectedUnits.includes(unit.name)}
                                onCheckedChange={() => handleUnitToggle(unit.name)}
                                disabled={isAssignedToOther}
                            />
                            <label
                                htmlFor={`unit-${unit.name}`}
                                className={cn(
                                    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                                    isAssignedToOther && "text-muted-foreground"
                                )}
                            >
                                {unit.propertyName}: Unit {unit.name}
                                {otherLandlord && <span className="text-xs"> (Assigned)</span>}
                            </label>
                        </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
