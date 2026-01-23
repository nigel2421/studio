
'use client';

import { useEffect, useState, useMemo } from 'react';
import { batchProcessPayments } from '@/lib/data';
import type { Tenant, Property, Payment } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';
import { PlusCircle, Loader2, X } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';


const allPaymentTypes: Payment['type'][] = ['Rent', 'Deposit', 'ServiceCharge', 'Water', 'Other'];

interface PaymentEntry {
  id: number;
  amount: string;
  type: Payment['type'];
  date: Date;
  notes: string;
  rentForMonth: string;
}

interface AddPaymentDialogProps {
  properties: Property[];
  tenants: Tenant[];
  onPaymentAdded: () => void;
  tenant?: Tenant | null;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  taskId?: string;
  defaultPaymentType?: Payment['type'];
}

export function AddPaymentDialog({ 
  properties, 
  tenants, 
  onPaymentAdded, 
  tenant = null, 
  children,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  taskId,
  defaultPaymentType,
}: AddPaymentDialogProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);

  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;
  
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
  
  const tenantForDisplay = useMemo(() => {
    if (tenant) return tenant;
    if (selectedUnit) {
      return tenants.find(t => t.propertyId === selectedProperty && t.unitName === selectedUnit);
    }
    return null;
  }, [tenant, selectedUnit, selectedProperty, tenants]);
  
  const availablePaymentTypes = useMemo(() => {
    if (tenantForDisplay?.residentType === 'Homeowner') {
      return allPaymentTypes.filter(t => t !== 'Rent' && t !== 'Deposit');
    }
    // Default to tenant types - they don't pay "ServiceCharge" directly, it's part of rent.
    return allPaymentTypes.filter(t => t !== 'ServiceCharge');
  }, [tenantForDisplay]);
  
  const defaultEntryType = useMemo(() => {
    return tenantForDisplay?.residentType === 'Homeowner' ? 'ServiceCharge' : 'Rent';
  }, [tenantForDisplay]);

  useEffect(() => {
    if (open) {
      const initialEntry: PaymentEntry = {
        id: Date.now(),
        amount: '',
        type: defaultPaymentType || defaultEntryType,
        date: new Date(),
        notes: '',
        rentForMonth: format(new Date(), 'yyyy-MM'),
      };
      setPaymentEntries([initialEntry]);

      if (tenant) {
        setSelectedProperty(tenant.propertyId);
        // We don't set unit/floor here because it will be derived from tenant
      }
    } else {
      // Reset form on close
      setPaymentEntries([]);
      if (!tenant) {
        setSelectedProperty('');
        setSelectedFloor('');
        setSelectedUnit('');
      }
    }
  }, [open, tenant, defaultPaymentType, defaultEntryType]);

  const monthOptions = Array.from({ length: 18 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i + 2);
    return {
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy'),
    };
  });

  const occupiedUnitsOnFloor = useMemo(() => {
    if (!selectedFloor) return [];
    const tenantUnitsForProperty = new Set(
      tenants.filter(t => t.propertyId === selectedProperty).map(t => t.unitName)
    );
    return unitsOnFloor.filter(unit => tenantUnitsForProperty.has(unit.name));
  }, [selectedProperty, selectedFloor, unitsOnFloor, tenants]);

  const handleEntryChange = (id: number, field: keyof Omit<PaymentEntry, 'id'>, value: any) => {
    setPaymentEntries(entries =>
      entries.map(entry => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };
  
  const addEntry = (type: Payment['type']) => {
    const newEntry: PaymentEntry = {
        id: Date.now(),
        amount: '',
        type: type,
        date: new Date(),
        notes: '',
        rentForMonth: format(new Date(), 'yyyy-MM'),
    };
    setPaymentEntries(prev => [...prev, newEntry]);
  };
  
  const removeEntry = (id: number) => {
      setPaymentEntries(prev => prev.filter(entry => entry.id !== id));
  };


  const { startLoading, stopLoading } = useLoading();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalTenantId = tenantForDisplay?.id;

    if (!finalTenantId) {
      toast({ variant: 'destructive', title: 'Missing Tenant', description: 'Please select a valid unit with an assigned tenant.' });
      return;
    }

    const validEntries = paymentEntries.filter(e => e.amount && Number(e.amount) > 0);

    if (validEntries.length === 0) {
      toast({ variant: 'destructive', title: 'No Payments', description: 'Please enter an amount for at least one payment record.' });
      return;
    }

    setIsLoading(true);
    startLoading(`Recording ${validEntries.length} payment(s)...`);
    try {
      const paymentsToBatch = validEntries.map(e => ({
        amount: Number(e.amount),
        date: format(e.date, 'yyyy-MM-dd'),
        notes: e.notes,
        rentForMonth: e.rentForMonth,
        type: e.type,
      }));

      await batchProcessPayments(finalTenantId, paymentsToBatch, taskId);

      toast({ title: 'Payments Added', description: `${validEntries.length} payment(s) have been successfully recorded.` });
      onPaymentAdded();
      stopLoading();
      setOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add one or more payments.' });
      stopLoading();
    } finally {
      setIsLoading(false);
    }
  };
  
  const trigger = children ? (
    <DialogTrigger asChild>{children}</DialogTrigger>
  ) : (
    controlledOpen === undefined ? 
    <DialogTrigger asChild>
      <Button>
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Payment
      </Button>
    </DialogTrigger> : null
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add Payment Record</DialogTitle>
          {tenantForDisplay && <DialogDescription>For {tenantForDisplay.name} - Unit {tenantForDisplay.unitName}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!tenant && (
              <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="development">Development</Label>
                    <Select onValueChange={setSelectedProperty} value={selectedProperty}>
                      <SelectTrigger id="development"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="floor">Floor</Label>
                    <Select onValueChange={setSelectedFloor} value={selectedFloor} disabled={!selectedProperty}>
                      <SelectTrigger id="floor"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{floors.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Select onValueChange={setSelectedUnit} value={selectedUnit} disabled={!selectedFloor}>
                      <SelectTrigger id="unit"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{occupiedUnitsOnFloor.map(u => <SelectItem key={u.name} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
              </div>
            )}

            {tenantForDisplay && (
                <div className="p-4 my-2 border rounded-lg bg-blue-50 border-blue-200">
                    <h4 className="font-semibold text-blue-900">Summary for {tenantForDisplay.name}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 text-sm">
                        <div className="text-muted-foreground">Monthly Charge:</div>
                        <div className="font-medium text-right md:text-left">Ksh {(tenantForDisplay.lease.rent || tenantForDisplay.lease.serviceCharge || 0).toLocaleString()}</div>
                        
                        {(tenantForDisplay.securityDeposit || 0) > 0 && (
                           <>
                            <div className="text-muted-foreground">Security Deposit:</div>
                            <div className="font-medium text-right md:text-left">Ksh {(tenantForDisplay.securityDeposit).toLocaleString()}</div>
                           </>
                        )}
                        {(tenantForDisplay.waterDeposit || 0) > 0 && (
                           <>
                            <div className="text-muted-foreground">Water Deposit:</div>
                            <div className="font-medium text-right md:text-left">Ksh {(tenantForDisplay.waterDeposit).toLocaleString()}</div>
                           </>
                        )}
                        <div className="text-muted-foreground font-bold text-red-600">Total Outstanding:</div>
                        <div className="font-bold text-red-600 text-right md:text-left">Ksh {(tenantForDisplay.dueBalance || 0).toLocaleString()}</div>
                    </div>
                </div>
            )}
            
            <div className="space-y-2 pt-4">
              <div className="flex items-center justify-between">
                <Label>Payment Records</Label>
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm">
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Record
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Payment Types</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {availablePaymentTypes.map(type => (
                             <DropdownMenuItem key={type} onSelect={() => addEntry(type)}>
                                {type}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {paymentEntries.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end p-3 border rounded-lg relative">
                     {paymentEntries.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeEntry(entry.id)} className="absolute -top-1 -right-1 h-6 w-6 z-10">
                            <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                     )}
                     <div className="space-y-1">
                      <Label htmlFor={`type-${entry.id}`} className="text-xs">Type</Label>
                      <Input id={`type-${entry.id}`} value={entry.type} readOnly className="bg-muted font-medium" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`amount-${entry.id}`} className="text-xs">Amount (Ksh)</Label>
                      <Input id={`amount-${entry.id}`} type="number" value={entry.amount} onChange={(e) => handleEntryChange(entry.id, 'amount', e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`rent-for-${entry.id}`} className="text-xs">For Month</Label>
                      <Select
                          value={entry.rentForMonth}
                          onValueChange={(value) => handleEntryChange(entry.id, 'rentForMonth', value)}
                      >
                          <SelectTrigger id={`rent-for-${entry.id}`} className="h-10">
                              <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                          <SelectContent>
                              {monthOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                  </SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`date-${entry.id}`} className="text-xs">Date Paid</Label>
                      <DatePicker value={entry.date} onChange={(d) => {if(d) handleEntryChange(entry.id, 'date', d)}} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`notes-${entry.id}`} className="text-xs">Notes</Label>
                        <Input id={`notes-${entry.id}`} value={entry.notes} onChange={(e) => handleEntryChange(entry.id, 'notes', e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading || paymentEntries.length === 0}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Payments
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
