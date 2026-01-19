
'use client';

import { useEffect, useState, useMemo } from 'react';
import { addPayment, getProperties } from '@/lib/data';
import type { Tenant, Property } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Percent, Users, PlusCircle, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';

interface AddPaymentDialogProps {
  properties: Property[];
  tenants: Tenant[];
  onPaymentAdded: () => void;
  tenant?: Tenant | null; // Optional tenant to pre-fill
  children?: React.ReactNode; // For the trigger
}

export function AddPaymentDialog({ properties, tenants, onPaymentAdded, tenant = null, children }: AddPaymentDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [notes, setNotes] = useState('');

  const {
    selectedProperty,
    setSelectedProperty,
    selectedFloor,
    setSelectedFloor,
    selectedUnit,
    setSelectedUnit,
    floors,
    unitsOnFloor,
  } = useUnitFilter(properties);

  const occupiedUnitsOnFloor = useMemo(() => {
    if (!selectedFloor) return [];
    const tenantUnitsForProperty = new Set(
      tenants
        .filter(t => t.propertyId === selectedProperty)
        .map(t => t.unitName)
    );
    return unitsOnFloor.filter(unit => tenantUnitsForProperty.has(unit.name));
  }, [selectedProperty, selectedFloor, unitsOnFloor, tenants]);

  useEffect(() => {
    if (tenant && open) {
      setSelectedProperty(tenant.propertyId);
      // We may not have floor data, so let's just set the unit directly
      setSelectedUnit(tenant.unitName);
    } else if (!open) {
        // Reset form on close
        setSelectedProperty('');
        setSelectedFloor('');
        setSelectedUnit('');
        setAmount('');
        setDate(new Date());
        setNotes('');
    }
  }, [tenant, open, setSelectedProperty, setSelectedUnit]);
  
  const { startLoading, stopLoading } = useLoading();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let tenantId = tenant?.id;
    let finalSelectedProperty = selectedProperty;
    let finalSelectedUnit = selectedUnit;

    if (tenant) {
        finalSelectedProperty = tenant.propertyId;
        finalSelectedUnit = tenant.unitName;
    }

    if (!finalSelectedProperty || !finalSelectedUnit || !amount || !date) {
      toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please fill out all required fields.' });
      return;
    }
    
    // Find tenant ID if not pre-selected
    if (!tenantId) {
        const foundTenant = tenants.find(t => t.propertyId === finalSelectedProperty && t.unitName === finalSelectedUnit);
        if (!foundTenant) {
            toast({ variant: 'destructive', title: 'Tenant Not Found', description: 'No active tenant found for the selected unit.' });
            return;
        }
        tenantId = foundTenant.id;
    }
    
    setIsLoading(true);
    startLoading('Recording Payment...');
    try {
      await addPayment({
        tenantId: tenantId,
        amount: Number(amount),
        date: format(date, 'yyyy-MM-dd'),
        notes,
        status: 'completed',
        type: 'Rent',
      });
      toast({ title: 'Payment Added', description: 'The payment has been successfully recorded.' });
      onPaymentAdded();
      stopLoading();
      setOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add payment.' });
      stopLoading();
    } finally {
      setIsLoading(false);
    }
  };

  const trigger = children ? (
      <DialogTrigger asChild>{children}</DialogTrigger>
  ) : (
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Payment
        </Button>
      </DialogTrigger>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Payment Record</DialogTitle>
          {tenant && <DialogDescription>For {tenant.name} - Unit {tenant.unitName}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="development">Development</Label>
              <Select onValueChange={setSelectedProperty} value={selectedProperty} disabled={!!tenant}>
                <SelectTrigger id="development">
                  <SelectValue placeholder="Select a development" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(prop => (
                    <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!tenant && (
                <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="floor">Floor</Label>
                    <Select onValueChange={setSelectedFloor} value={selectedFloor} disabled={!selectedProperty}>
                    <SelectTrigger id="floor">
                        <SelectValue placeholder="Select floor" />
                    </SelectTrigger>
                    <SelectContent>
                        {floors.map(floor => (
                        <SelectItem key={floor} value={floor}>{floor}</SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Select onValueChange={setSelectedUnit} value={selectedUnit} disabled={!selectedFloor}>
                    <SelectTrigger id="unit">
                        <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                        {occupiedUnitsOnFloor.map(unit => (
                        <SelectItem key={unit.name} value={unit.name}>{unit.name}</SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>
                </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (Ksh)</Label>
              <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
