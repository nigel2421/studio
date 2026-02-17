// This is a new file.
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { addNoticeToVacate } from '@/lib/data';
import { type Tenant, type Property } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addMonths } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/hooks/useLoading';
import { Loader2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { useAuth } from '@/hooks/useAuth';

interface AddNoticeDialogProps {
  properties: Property[];
  tenants: Tenant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNoticeAdded: () => void;
}

export function AddNoticeDialog({ 
  properties, 
  tenants,
  open,
  onOpenChange,
  onNoticeAdded,
}: AddNoticeDialogProps) {
  const { toast } = useToast();
  const { startLoading, stopLoading } = useLoading();
  const { userProfile } = useAuth();

  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [moveOutDate, setMoveOutDate] = useState<Date | undefined>(addMonths(new Date(), 1));

  const occupiedUnits = useMemo(() => {
    if (!selectedProperty) return [];
    const tenantUnits = tenants
      .filter(t => t.propertyId === selectedProperty)
      .map(t => t.unitName);
    const property = properties.find(p => p.id === selectedProperty);
    return property?.units.filter(u => tenantUnits.includes(u.name)) || [];
  }, [selectedProperty, properties, tenants]);

  const selectedTenant = useMemo(() => {
    if (!selectedUnit || !selectedProperty) return null;
    return tenants.find(t => t.propertyId === selectedProperty && t.unitName === selectedUnit);
  }, [selectedUnit, selectedProperty, tenants]);
  
  useEffect(() => {
    if(!open) {
        setSelectedProperty('');
        setSelectedUnit('');
        setMoveOutDate(addMonths(new Date(), 1));
    }
  }, [open]);

  useEffect(() => {
    setSelectedUnit('');
  }, [selectedProperty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant || !selectedProperty || !selectedUnit || !moveOutDate || !userProfile?.name) {
        toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a property, unit, and date.' });
        return;
    }
    
    startLoading('Submitting notice...');
    try {
        const property = properties.find(p => p.id === selectedProperty);
        
        await addNoticeToVacate({
            tenantId: selectedTenant.id,
            propertyId: selectedProperty,
            unitName: selectedUnit,
            tenantName: selectedTenant.name,
            propertyName: property?.name || 'N/A',
            noticeSubmissionDate: new Date().toISOString(),
            scheduledMoveOutDate: format(moveOutDate, 'yyyy-MM-dd'),
            submittedBy: 'Admin',
            submittedByName: userProfile.name,
            status: 'Active',
        });
        
        toast({ title: 'Notice Submitted', description: `Notice to vacate for ${selectedTenant.name} has been recorded.` });
        onNoticeAdded();
        onOpenChange(false);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit notice.' });
    } finally {
        stopLoading();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Notice to Vacate</DialogTitle>
          <DialogDescription>
            Select a tenant and their scheduled move-out date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="property">Property</Label>
                <Select onValueChange={setSelectedProperty} value={selectedProperty}>
                  <SelectTrigger id="property"><SelectValue placeholder="Select a property" /></SelectTrigger>
                  <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select onValueChange={setSelectedUnit} value={selectedUnit} disabled={!selectedProperty}>
                  <SelectTrigger id="unit"><SelectValue placeholder="Select an occupied unit" /></SelectTrigger>
                  <SelectContent>{occupiedUnits.map(u => <SelectItem key={u.name} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {selectedTenant && (
                <div className='p-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-md'>
                    Tenant: <span className="font-semibold">{selectedTenant.name}</span>
                </div>
              )}
               <div className="space-y-2">
                <Label htmlFor="move-out-date">Scheduled Move-Out Date</Label>
                <DatePicker id="move-out-date" value={moveOutDate} onChange={setMoveOutDate} />
              </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!selectedTenant || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Notice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
