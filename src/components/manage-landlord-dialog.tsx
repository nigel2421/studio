
'use client';

import { useState, useEffect } from 'react';
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
import type { Landlord, Property } from '@/lib/types';
import { Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  landlord: Landlord;
  property: Property;
  onSave: (landlord: Landlord) => void;
}

export function ManageLandlordDialog({ isOpen, onClose, landlord, property, onSave }: Props) {
  const [name, setName] = useState(landlord.name);
  const [bankAccount, setBankAccount] = useState(landlord.bankAccount);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setName(landlord.name);
    setBankAccount(landlord.bankAccount);
  }, [landlord]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    onSave({
        ...landlord,
        name,
        bankAccount,
    });
    setIsLoading(false);
  }

  // Placeholder for earnings calculation
  const landlordUnits = property.units.filter(u => u.ownership === 'Landlord');
  const earnings = `Calculation pending...`;


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manage Landlord for {property.name}</DialogTitle>
          <DialogDescription>
            View and edit the landlord's details and earnings for this property.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="landlord-name">Landlord Name</Label>
              <Input id="landlord-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bank-account">Bank Account Details</Label>
              <Input id="bank-account" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>
             <div className="grid gap-2">
                <Label>Landlord Units</Label>
                <p className="text-sm text-muted-foreground">
                    {landlordUnits.map(u => u.name).join(', ')}
                </p>
            </div>
            <div className="grid gap-2">
              <Label>Potential Earnings (from occupied units)</Label>
              <p className="text-lg font-semibold">{earnings}</p>
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
