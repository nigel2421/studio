
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { batchProcessPayments } from '@/lib/data';
import { type Tenant, type Property, type Payment, paymentMethods, type WaterMeterReading } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addMonths, startOfMonth } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';
import { PlusCircle, Loader2, X } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

const allPaymentTypes: Payment['type'][] = ['Rent', 'Deposit', 'ServiceCharge', 'Water', 'Adjustment', 'Other'];

interface PaymentEntry {
  id: number;
  amount: string;
  type: Payment['type'];
  date: Date;
  rentForMonth: string;
  paymentMethod: Payment['paymentMethod'];
  transactionId: string;
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
  allReadings?: WaterMeterReading[];
  readingForPayment?: WaterMeterReading | null;
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
  allReadings,
  readingForPayment,
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

  const displayData = useMemo(() => {
    if (!tenantForDisplay) return { balance: 0, nextDueDate: null, waterBalance: 0 };
    const today = new Date();
    let dueDate = startOfMonth(today.getDate() > 5 ? addMonths(today, 1) : today);
    dueDate.setDate(5);

    let waterBalance = 0;
    if (allReadings) {
        waterBalance = allReadings
            .filter(r => r.tenantId === tenantForDisplay.id && (r.status === 'Pending' || r.status === undefined))
            .reduce((sum, r) => sum + r.amount, 0);
    }

    return {
        balance: tenantForDisplay.dueBalance || 0,
        nextDueDate: format(dueDate, 'do MMMM yyyy'),
        waterBalance,
    };
  }, [tenantForDisplay, allReadings]);

  const availablePaymentTypes = useMemo(() => {
    if (tenantForDisplay?.residentType === 'Homeowner') {
      return allPaymentTypes.filter(t => t !== 'Rent' && t !== 'Deposit');
    }
    return allPaymentTypes.filter(t => t !== 'ServiceCharge');
  }, [tenantForDisplay]);
  
  const defaultEntryType = useMemo(() => {
    return tenantForDisplay?.residentType === 'Homeowner' ? 'ServiceCharge' : 'Rent';
  }, [tenantForDisplay]);

  const getDefaultAmount = useCallback((type: Payment['type'], tenantInfo: Tenant | null | undefined): string => {
    if (!tenantInfo) return '';
    switch (type) {
      case 'Rent': return (tenantInfo.lease?.rent || '').toString();
      case 'ServiceCharge': return (tenantInfo.lease?.serviceCharge || '').toString();
      case 'Water': return (displayData.waterBalance || '').toString();
      case 'Deposit': return (tenantInfo.securityDeposit || '').toString();
      default: return '';
    }
  }, [displayData.waterBalance]);

  useEffect(() => {
    if (open) {
        const type = defaultPaymentType || defaultEntryType;
        let amount = (readingForPayment && type === 'Water') ? readingForPayment.amount.toString() : getDefaultAmount(type, tenantForDisplay);
        const initialEntry: PaymentEntry = { id: Date.now(), amount, type, date: new Date(), rentForMonth: format(new Date(), 'yyyy-MM'), paymentMethod: 'M-Pesa', transactionId: '' };
        setPaymentEntries([initialEntry]);
        if (tenant) setSelectedProperty(tenant.propertyId);
    } else {
        setPaymentEntries([]);
        if (!tenant) { setSelectedProperty(''); setSelectedFloor(''); setSelectedUnit(''); }
    }
  }, [open, tenant, tenantForDisplay, defaultPaymentType, defaultEntryType, readingForPayment, getDefaultAmount, setSelectedProperty, setSelectedFloor, setSelectedUnit]);

  const monthOptions = Array.from({ length: 18 }, (_, i) => {
    const d = new Date();
    d.setDate(1); d.setMonth(d.getMonth() - i);
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
  });

  const occupiedUnitsOnFloor = useMemo(() => {
    if (!selectedFloor) return [];
    const tenantUnits = new Set(tenants.filter(t => t.propertyId === selectedProperty).map(t => t.unitName));
    return unitsOnFloor.filter(unit => tenantUnits.has(unit.name));
  }, [selectedProperty, selectedFloor, unitsOnFloor, tenants]);

  const handleEntryChange = (id: number, field: keyof Omit<PaymentEntry, 'id'>, value: any) => {
    setPaymentEntries(entries => entries.map(entry => (entry.id === id ? { ...entry, [field]: value } : entry)));
  };
  
  const addEntry = (type: Payment['type']) => {
    setPaymentEntries(prev => [...prev, { id: Date.now(), amount: getDefaultAmount(type, tenantForDisplay), type, date: new Date(), rentForMonth: format(new Date(), 'yyyy-MM'), paymentMethod: 'M-Pesa', transactionId: '' }]);
  };
  
  const { startLoading, stopLoading } = useLoading();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantForDisplay?.id) { toast({ variant: 'destructive', title: 'Missing Tenant' }); return; }
    if (paymentEntries.some(e => !e.transactionId && e.type !== 'Adjustment')) { toast({ variant: 'destructive', title: 'Missing Transaction ID' }); return; }
    const validEntries = paymentEntries.filter(e => e.amount && (e.type === 'Adjustment' ? e.amount !== '0' : Number(e.amount) > 0));
    if (validEntries.length === 0) { toast({ variant: 'destructive', title: 'No Payments' }); return; }

    setIsLoading(true);
    startLoading(`Recording ${validEntries.length} payment(s)...`);
    try {
      const data = validEntries.map(e => ({ amount: Number(e.amount), date: format(e.date, 'yyyy-MM-dd'), rentForMonth: e.rentForMonth, type: e.type, paymentMethod: e.paymentMethod, transactionId: e.transactionId, waterReadingId: e.type === 'Water' && readingForPayment ? readingForPayment.id : undefined }));
      await batchProcessPayments(tenantForDisplay.id, data, taskId);
      toast({ title: 'Payments Added' });
      onPaymentAdded();
      setOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsLoading(false);
      stopLoading();
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Payment Record</DialogTitle>
          {tenantForDisplay && <DialogDescription>For {tenantForDisplay.name} - Unit {tenantForDisplay.unitName}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!tenant && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Development</Label><Select onValueChange={setSelectedProperty} value={selectedProperty}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Floor</Label><Select onValueChange={setSelectedFloor} value={selectedFloor} disabled={!selectedProperty}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{floors.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Unit</Label><Select onValueChange={setSelectedUnit} value={selectedUnit} disabled={!selectedFloor}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{occupiedUnitsOnFloor.map(u => <SelectItem key={u.name} value={u.name}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
            )}
            {tenantForDisplay && (
                <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
                    <h4 className="font-semibold text-blue-900">Summary for {tenantForDisplay.name}</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
                        <div><div className="text-muted-foreground">Charge:</div><div className="font-medium">Ksh {(tenantForDisplay.lease?.rent || tenantForDisplay.lease?.serviceCharge || 0).toLocaleString()}</div></div>
                        <div><div className="text-muted-foreground">Due Date:</div><div className="font-medium">{displayData.nextDueDate}</div></div>
                        <div className="col-span-2 pt-2 border-t border-blue-200 flex justify-between font-bold text-red-600"><span>Pending Balance:</span><span>Ksh {displayData.balance.toLocaleString()}</span></div>
                    </div>
                </div>
            )}
            <div className="space-y-2 pt-4">
              <div className="flex items-center justify-between"><Label>Payment Records</Label>
                 <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Add Record</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuLabel>Types</DropdownMenuLabel><DropdownMenuSeparator />{availablePaymentTypes.map(type => (<DropdownMenuItem key={type} onSelect={() => addEntry(type)}>{type}</DropdownMenuItem>))}</DropdownMenuContent></DropdownMenu>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {paymentEntries.map((entry) => (
                  <div key={entry.id} className="p-3 border rounded-lg relative space-y-4">
                     {paymentEntries.length > 1 && (<Button type="button" variant="ghost" size="icon" onClick={() => setPaymentEntries(prev => prev.filter(e => e.id !== entry.id))} className="absolute top-1 right-1 h-6 w-6 z-10"><X className="h-4 w-4 text-muted-foreground" /></Button>)}
                     <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="space-y-1"><Label className="text-xs">Type</Label><Input value={entry.type} readOnly className="bg-muted font-medium" /></div>
                        <div className="space-y-1"><Label className="text-xs">Amount (Ksh)</Label><Input type="number" value={entry.amount} onChange={(e) => handleEntryChange(entry.id, 'amount', e.target.value)} required /></div>
                        <div className="space-y-1"><Label className="text-xs">Method</Label><Select value={entry.paymentMethod} onValueChange={(v) => handleEntryChange(entry.id, 'paymentMethod', v)}><SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger><SelectContent>{paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-xs">Date</Label><DatePicker value={entry.date} onChange={(d) => d && handleEntryChange(entry.id, 'date', d)} /></div>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1"><Label className="text-xs">Month</Label><Select value={entry.rentForMonth} onValueChange={(v) => handleEntryChange(entry.id, 'rentForMonth', v)}><SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger><SelectContent>{monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-1"><Label className="text-xs">Transaction ID</Label><Input value={entry.transactionId} onChange={(e) => handleEntryChange(entry.id, 'transactionId', e.target.value)} required /></div>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter><Button type="submit" disabled={isLoading || paymentEntries.length === 0}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Payments'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
