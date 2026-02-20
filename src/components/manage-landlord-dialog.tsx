
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
import { Loader2, Search } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { useLoading } from '@/hooks/useLoading';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [unitSearchTerm, setUnitSearchTerm] = useState('');
  const { isLoading, startLoading, stopLoading } = useLoading();
  const { toast } = useToast();
  
  const allLandlordOwnedUnits = useMemo(() => {
    return properties.flatMap(p => 
      p.units
        .filter(u => u.ownership === 'Landlord')
        .map(u => ({...u, propertyId: p.id, propertyName: p.name}))
    );
  }, [properties]);
  
  useEffect(() => {
    if (isOpen) {
      if (landlord) {
        setName(landlord.name || '');
        setEmail(landlord.email || '');
        setPhone(landlord.phone || '');
        setBankName(landlord.bankName || '');
        setBankAccountNumber(landlord.bankAccountNumber || '');
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
        setBankName('');
        setBankAccountNumber('');
        setSelectedUnits([]);
      }
      setUnitSearchTerm('');
    }
  }, [landlord, isOpen, allLandlordOwnedUnits]);

  const filteredUnits = useMemo(() => {
    if (!unitSearchTerm) {
        return allLandlordOwnedUnits;
    }
    const lowercasedFilter = unitSearchTerm.toLowerCase();
    return allLandlordOwnedUnits.filter(unit =>
        unit.name.toLowerCase().includes(lowercasedFilter) ||
        unit.propertyName.toLowerCase().includes(lowercasedFilter)
    );
  }, [allLandlordOwnedUnits, unitSearchTerm]);


  const handleUnitToggle = (unitName: string) => {
    setSelectedUnits(prev =>
      prev.includes(unitName)
        ? prev.filter(name => name !== unitName)
        : [...prev, unitName]
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.length > 100) {
        toast({
            variant: "destructive",
            title: "Name Too Long",
            description: "The landlord name cannot exceed 100 characters.",
        });
        return;
    }
    startLoading(landlord ? 'Updating Landlord...' : 'Adding Landlord...');
    try {
      const landlordData: Landlord = {
        id: landlord?.id || `landlord_${Date.now()}`,
        name,
        email,
        phone,
        bankName,
        bankAccountNumber,
        userId: landlord?.userId,
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
                    <Input id="landlord-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="bank-name">Bank Name</Label>
                <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. NCBA" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bank-account-number">Account Number</Label>
                <Input id="bank-account-number" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="e.g. 123456789" />
              </div>
            </div>

            <div className="grid gap-4 pt-2">
              <Label>Assign Landlord Units</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search units or properties..."
                    className="pl-9"
                    value={unitSearchTerm}
                    onChange={(e) => setUnitSearchTerm(e.target.value)}
                />
              </div>
              <ScrollArea className="h-40 rounded-md border p-4">
                <div className="space-y-2">
                  {filteredUnits.map(unit => {
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
