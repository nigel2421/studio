
'use client';

import { useEffect, useState, useMemo } from 'react';
import { addPayment } from '@/lib/data';
import type { Tenant, Property, Payment } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, addMonths } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';
import { PlusCircle, Calendar as CalendarIcon, Loader2, X } from 'lucide-react';

interface PaymentEntry {
  id: number;
  amount: string;
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
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([{ id: 1, amount: '', date: new Date(), notes: '', rentForMonth: format(new Date(), 'yyyy-MM') }]);
  const [paymentType, setPaymentType] = useState<Payment['type']>('Rent');

  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const monthOptions = Array.from({ length: 18 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i + 2);
    return {
        value: format(d, 'yyyy-MM'),
        label: format(d, 'MMMM yyyy'),
    };
  });

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
      tenants.filter(t => t.propertyId === selectedProperty).map(t => t.unitName)
    );
    return unitsOnFloor.filter(unit => tenantUnitsForProperty.has(unit.name));
  }, [selectedProperty, selectedFloor, unitsOnFloor, tenants]);
  
  const tenantForDisplay = useMemo(() => {
    if (tenant) return tenant; // From props
    if (selectedUnit) {
        return tenants.find(t => t.propertyId === selectedProperty && t.unitName === selectedUnit);
    }
    return null;
  }, [tenant, selectedUnit, selectedProperty, tenants]);

  const resetForm = () => {
    setPaymentEntries([{ id: 1, amount: '', date: new Date(), notes: '', rentForMonth: format(new Date(), 'yyyy-MM') }]);
    setPaymentType('Rent');
    if (!tenant) { // Don't reset if a tenant is pre-selected
        setSelectedProperty('');
        setSelectedFloor('');
        setSelectedUnit('');
    }
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    } else {
      if (tenant) {
        setSelectedProperty(tenant.propertyId);
        setSelectedUnit(tenant.unitName);
      }
      if (defaultPaymentType) {
        setPaymentType(defaultPaymentType);
      }
    }
  }, [tenant, open, defaultPaymentType]);

  const { startLoading, stopLoading } = useLoading();

  const handleEntryChange = (id: number, field: keyof Omit<PaymentEntry, 'id'>, value: any) => {
    setPaymentEntries(entries =>
      entries.map(entry => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const addEntry = () => {
    setPaymentEntries(entries => [...entries, { id: Date.now(), amount: '', date: new Date(), notes: '', rentForMonth: format(new Date(), 'yyyy-MM') }]);
  };

  const removeEntry = (id: number) => {
    setPaymentEntries(entries => entries.filter(entry => entry.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let tenantId = tenant?.id;
    let finalSelectedProperty = selectedProperty;
    let finalSelectedUnit = selectedUnit;

    if (tenant) {
      finalSelectedProperty = tenant.propertyId;
      finalSelectedUnit = tenant.unitName;
    }

    if (!finalSelectedProperty || !finalSelectedUnit) {
      toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please select a property and unit.' });
      return;
    }

    if (!tenantId) {
      const foundTenant = tenants.find(t => t.propertyId === finalSelectedProperty && t.unitName === finalSelectedUnit);
      if (!foundTenant) {
        toast({ variant: 'destructive', title: 'Tenant Not Found', description: 'No active tenant found for the selected unit.' });
        return;
      }
      tenantId = foundTenant.id;
    }

    const validEntries = paymentEntries.filter(e => e.amount && Number(e.amount) > 0);

    if (validEntries.length === 0) {
        toast({ variant: 'destructive', title: 'No Payments', description: 'Please enter at least one payment amount.' });
        return;
    }

    setIsLoading(true);
    startLoading(`Recording ${validEntries.length} payment(s)...`);
    try {
      const paymentPromises = validEntries.map(entry =>
        addPayment({
          tenantId: tenantId!,
          amount: Number(entry.amount),
          date: format(entry.date, 'yyyy-MM-dd'),
          notes: entry.notes,
          rentForMonth: entry.rentForMonth,
          status: 'Paid',
          type: paymentType,
        }, taskId)
      );

      await Promise.all(paymentPromises);

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
          {tenant && <DialogDescription>For {tenant.name} - Unit {tenant.unitName}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {tenantForDisplay && (
                <div className="p-4 my-2 border rounded-lg bg-blue-50 border-blue-200">
                    <h4 className="font-semibold text-blue-900">Summary for {tenantForDisplay.name}</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
                        
                        {(tenantForDisplay.residentType === 'Tenant') && (
                            <>
                                <div className="text-muted-foreground">Monthly Rent:</div>
                                <div className="font-medium text-right">Ksh {(tenantForDisplay.lease.rent || 0).toLocaleString()}</div>
                            </>
                        )}

                        {(tenantForDisplay.residentType !== 'Tenant') && (
                            <>
                                <div className="text-muted-foreground">Monthly Service Charge:</div>
                                <div className="font-medium text-right">Ksh {(tenantForDisplay.lease.serviceCharge || 0).toLocaleString()}</div>
                            </>
                        )}
                        
                        {(tenantForDisplay.securityDeposit || 0) > 0 && (
                           <>
                            <div className="text-muted-foreground">Security Deposit:</div>
                            <div className="font-medium text-right">Ksh {(tenantForDisplay.securityDeposit || 0).toLocaleString()}</div>
                           </>
                        )}

                        {(tenantForDisplay.waterDeposit || 0) > 0 && (
                           <>
                            <div className="text-muted-foreground">Water Deposit:</div>
                            <div className="font-medium text-right">Ksh {(tenantForDisplay.waterDeposit || 0).toLocaleString()}</div>
                           </>
                        )}

                        <div className="text-muted-foreground font-bold text-red-600">Total Outstanding:</div>
                        <div className="font-bold text-red-600 text-right">Ksh {(tenantForDisplay.dueBalance || 0).toLocaleString()}</div>
                    </div>
                </div>
            )}
             <div className="space-y-2 pt-2">
                <Label htmlFor="payment-type">Payment Type</Label>
                <Select value={paymentType} onValueChange={(v) => setPaymentType(v as Payment['type'])}>
                    <SelectTrigger id="payment-type">
                        <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Rent">Rent Payment</SelectItem>
                        <SelectItem value="Deposit">Security/Water Deposit</SelectItem>
                        <SelectItem value="ServiceCharge">Service Charge</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2 pt-4">
              <Label>Payment Records</Label>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {paymentEntries.map((entry, index) => (
                  <div key={entry.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end p-3 border rounded-lg">
                    <div className="space-y-1">
                      <Label htmlFor={`amount-${entry.id}`} className="text-xs">Amount (Ksh)</Label>
                      <Input id={`amount-${entry.id}`} type="number" value={entry.amount} onChange={(e) => handleEntryChange(entry.id, 'amount', e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`rent-for-${entry.id}`} className="text-xs">Rent For Month</Label>
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
                      <Label htmlFor={`date-${entry.id}`} className="text-xs">Payment Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal h-10", !entry.date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {entry.date ? format(entry.date, "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={entry.date}
                            onSelect={(d) => d && handleEntryChange(entry.id, 'date', d)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1 md:col-span-2 grid grid-cols-[1fr_auto] gap-2 items-end">
                       <div className="space-y-1">
                         <Label htmlFor={`notes-${entry.id}`} className="text-xs">Notes</Label>
                         <Input id={`notes-${entry.id}`} value={entry.notes} onChange={(e) => handleEntryChange(entry.id, 'notes', e.target.value)} />
                       </div>
                        {paymentEntries.length > 1 && (
                            <Button type="button" variant="destructive" size="icon" className="h-10 w-10" onClick={() => removeEntry(entry.id)}>
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
               <Button type="button" variant="outline" size="sm" onClick={addEntry}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Record
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Payments
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
