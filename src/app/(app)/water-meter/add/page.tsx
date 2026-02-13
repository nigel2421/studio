'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addWaterMeterReading, getLatestWaterReading, getPropertyWaterReadings, getTenants, getPayment, updatePayment, forceRecalculateTenantBalance, getLandlords, getPropertyOwners, addPayment, getWaterReadingsAndTenants } from '@/lib/data';
import type { Property, WaterMeterReading, Tenant, Payment, Landlord, PropertyOwner, Unit } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, PlusCircle, Edit2, User, ChevronDown, Mail } from 'lucide-react';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';
import { format } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';
import { useAuth } from '@/hooks/useAuth';
import { EditPaymentDialog, EditFormValues } from '@/components/financials/edit-payment-dialog';
import { doc, updateDoc, writeBatch, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ConfirmOwnerWaterPaymentDialog } from '@/components/financials/confirm-owner-water-payment-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { performSendWaterBills } from '@/app/actions';


interface WaterReadingRecord extends WaterMeterReading {
    tenantName?: string;
    propertyName?: string;
    ownerId?: string;
    ownerName?: string;
}

interface OwnerBill {
    owner: PropertyOwner | Landlord;
    readings: WaterReadingRecord[];
    totalDue: number;
}


export default function MegarackPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // Common state
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [allLandlords, setAllLandlords] = useState<Landlord[]>([]);
  const [allOwners, setAllOwners] = useState<PropertyOwner[]>([]);
  const { userProfile } = useAuth();
  
  // State for Add Form
  const [priorReading, setPriorReading] = useState<number | null>(null);
  const [isPriorReadingLoading, setIsPriorReadingLoading] = useState(false);
  const [priorReadingSource, setPriorReadingSource] = useState<string | null>(null);
  const [currentReading, setCurrentReading] = useState('');
  const [readingDate, setReadingDate] = useState<Date | undefined>(new Date());
  const [isSaving, setIsSaving] = useState(false);

  const {
    selectedProperty: formSelectedProperty,
    setSelectedProperty: setFormSelectedProperty,
    selectedFloor,
    setSelectedFloor,
    selectedUnit,
    setSelectedUnit,
    floors,
    unitsOnFloor,
  } = useUnitFilter(properties);

  // State for Records Table
  const [allReadings, setAllReadings] = useState<WaterReadingRecord[]>([]);
  const [ownerBills, setOwnerBills] = useState<OwnerBill[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsSelectedProperty, setRecordsSelectedProperty] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedTenantForPayment, setSelectedTenantForPayment] = useState<Tenant | null>(null);
  const [selectedReadingForPayment, setSelectedReadingForPayment] = useState<WaterReadingRecord | null>(null);

  // State for Editing Payment
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const { startLoading, stopLoading, isLoading: isActionLoading } = useLoading();
  
  // State for Consolidated Payment
  const [isConsolidatedPaymentOpen, setIsConsolidatedPaymentOpen] = useState(false);
  const [selectedOwnerBill, setSelectedOwnerBill] = useState<OwnerBill | null>(null);
  
  // State for Bulk Actions
  const [selectedReadings, setSelectedReadings] = useState<string[]>([]);
  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);


  // Combined data fetching
  const fetchData = async () => {
        setLoadingRecords(true);
        const [propsData, tenantsData, landlordsData, ownersData] = await Promise.all([
            getProperties(true),
            getTenants(),
            getLandlords(),
            getPropertyOwners()
        ]);
        setProperties(propsData);
        setTenants(tenantsData);
        setAllLandlords(landlordsData);
        setAllOwners(ownersData);

        const allReadingsData = (await Promise.all(propsData.map(p => getPropertyWaterReadings(p.id))))
            .flat()
            .map(reading => {
                const tenant = tenantsData.find(t => t.id === reading.tenantId);
                const property = propsData.find(p => p.id === reading.propertyId);
                return {
                    ...reading,
                    tenantName: tenant?.name || 'N/A',
                    propertyName: property?.name || 'N/A',
                };
            });
        
        setAllReadings(allReadingsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setLoadingRecords(false);
    }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (loadingRecords) return;

    // Process Owner Bills
    const ownerByUnitMap = new Map<string, PropertyOwner>();
    allOwners.forEach(o => {
        o.assignedUnits?.forEach(au => {
            au.unitNames.forEach(unitName => {
                ownerByUnitMap.set(`${au.propertyId}-${unitName}`, o);
            });
        });
    });

    const pendingReadings = allReadings.filter(r => (r.status === 'Pending' || r.status === undefined));
    const billsByOwner = new Map<string, { owner: PropertyOwner | Landlord, readings: WaterReadingRecord[] }>();

    pendingReadings.forEach(reading => {
        let owner: Landlord | PropertyOwner | undefined;
        const property = properties.find(p => p.id === reading.propertyId);
        const unit = property?.units.find(u => u.name === reading.unitName);

        if (unit?.landlordId) {
            owner = allLandlords.find(l => l.id === unit.landlordId);
        } else {
            owner = ownerByUnitMap.get(`${reading.propertyId}-${reading.unitName}`);
        }
        
        if (owner) {
            if (!billsByOwner.has(owner.id)) {
                billsByOwner.set(owner.id, { owner, readings: [] });
            }
            const ownerData = billsByOwner.get(owner.id)!;
            ownerData.readings.push({
                ...reading,
                ownerId: owner.id,
                ownerName: owner.name,
            });
        }
    });

    const ownerBillsData = Array.from(billsByOwner.values()).map(data => ({
        ...data,
        totalDue: data.readings.reduce((sum, r) => sum + r.amount, 0),
    })).filter(data => data.readings.length > 0);

    setOwnerBills(ownerBillsData);

}, [allReadings, loadingRecords, allOwners, allLandlords, properties]);

  const handlePaymentAdded = () => {
      fetchData();
  }

  // Effect for Add Form (fetching prior reading)
  useEffect(() => {
    if (selectedUnit && formSelectedProperty) {
      const fetchPriorReading = async () => {
        setIsPriorReadingLoading(true);
        setPriorReading(null);
        setPriorReadingSource(null);

        const latestReading = await getLatestWaterReading(formSelectedProperty, selectedUnit);
        if (latestReading) {
          setPriorReading(latestReading.currentReading);
          setPriorReadingSource(`From last reading on ${format(new Date(latestReading.date), 'PPP')}`);
        } else {
          const property = properties.find(p => p.id === formSelectedProperty);
          const unit = property?.units.find(u => u.name === selectedUnit);
          if (unit && unit.baselineReading !== undefined) {
            setPriorReading(unit.baselineReading);
            setPriorReadingSource('From unit baseline reading');
          } else {
            setPriorReading(0);
            setPriorReadingSource('No previous reading or baseline found. Defaulted to 0.');
          }
        }
        setIsPriorReadingLoading(false);
      };
      fetchPriorReading();
    } else {
        setPriorReading(null);
        setPriorReadingSource(null);
    }
  }, [selectedUnit, formSelectedProperty, properties]);

  const consumption = (currentReading && priorReading !== null) ? Number(currentReading) - priorReading : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSelectedProperty || !selectedUnit || currentReading === '') {
      toast({ variant: "destructive", title: "Missing Information", description: "Please fill out all fields." });
      return;
    }
    if (priorReading === null) {
        toast({ variant: "destructive", title: "Missing Information", description: "Prior reading is not set. Please select a unit." });
        return;
    }
    if (Number(currentReading) < priorReading) {
        toast({ variant: "destructive", title: "Invalid Reading", description: "Current reading cannot be less than the prior reading." });
        return;
    }
    if (!readingDate) {
      toast({ variant: "destructive", title: "Missing Date", description: "Please select a reading date." });
      return;
    }

    setIsSaving(true);
    startLoading('Recording Water Reading...');
    try {
      await addWaterMeterReading({
        propertyId: formSelectedProperty,
        unitName: selectedUnit,
        priorReading: priorReading,
        currentReading: Number(currentReading),
        date: format(readingDate, 'yyyy-MM-dd'),
      });
      toast({ title: "Reading Added", description: `Water meter reading for unit ${selectedUnit} has been saved.` });
      // Switch to records tab after successful submission
      const recordsTab = document.querySelector('button[data-state="inactive"][value="all-records"]');
      if (recordsTab instanceof HTMLElement) {
          recordsTab.click();
      }
      fetchData(); // Refresh records
    } catch (error: any) {
      console.error('Error adding water meter reading:', error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to add reading. Please try again." });
    } finally {
      setIsSaving(false);
      stopLoading();
    }
  };

  const handleRecordPaymentClick = (reading: WaterReadingRecord) => {
      const tenant = tenants.find(t => t.id === reading.tenantId);
      if (tenant) {
          setSelectedTenantForPayment(tenant);
          setSelectedReadingForPayment(reading);
          setIsPaymentDialogOpen(true);
      } else {
          toast({
              variant: 'destructive',
              title: 'Tenant not found',
              description: 'Could not find an active tenant for this water reading.',
          });
      }
  };
  
  const handleOpenConsolidatedPayment = (ownerBill: OwnerBill) => {
      setSelectedOwnerBill(ownerBill);
      setIsConsolidatedPaymentOpen(true);
  };
  
  const handleConfirmConsolidatedPayment = async (paymentData: { amount: number, date: Date, paymentMethod: Payment['paymentMethod'], transactionId: string }) => {
    if (!selectedOwnerBill) return;
    
    startLoading('Processing consolidated payment...');
    try {
        const batch = writeBatch(db);
        let amountToAllocate = paymentData.amount;
        const readingsToPay = selectedOwnerBill.readings.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Create one main payment record for the consolidated amount
        const primaryTenantId = readingsToPay[0].tenantId;
        const mainPaymentRef = doc(collection(db, 'payments'));
        const mainPaymentPayload = {
            tenantId: primaryTenantId,
            amount: paymentData.amount,
            date: format(paymentData.date, 'yyyy-MM-dd'),
            type: 'Water' as const,
            status: 'Paid' as const,
            notes: `Consolidated water payment for ${selectedOwnerBill.owner.name}. Covers ${readingsToPay.length} bill(s).`,
            paymentMethod: paymentData.paymentMethod,
            transactionId: paymentData.transactionId,
            createdAt: new Date(),
        };
        batch.set(mainPaymentRef, mainPaymentPayload);

        // Update each water reading record
        for (const reading of readingsToPay) {
            if (amountToAllocate >= reading.amount) {
                const readingRef = doc(db, 'waterReadings', reading.id);
                batch.update(readingRef, { status: 'Paid', paymentId: mainPaymentRef.id });
                amountToAllocate -= reading.amount;
            } else {
                // Handle partial payment if necessary, for now we assume full payment of oldest bills
                console.warn(`Partial payment detected. Not enough funds to cover bill for unit ${reading.unitName} dated ${reading.date}.`);
                break;
            }
        }
        
        await batch.commit();

        toast({ title: 'Payment Successful', description: `Consolidated payment for ${selectedOwnerBill.owner.name} recorded.` });
        fetchData(); // Refresh all data
        setIsConsolidatedPaymentOpen(false);

    } catch (error) {
        console.error("Error processing consolidated payment:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to process consolidated payment.' });
    } finally {
        stopLoading();
    }
  };

  const handleEditClick = async (reading: WaterReadingRecord) => {
    if (!reading.paymentId) {
        toast({
            variant: 'destructive',
            title: 'No Payment Record',
            description: 'Could not find the payment record associated with this bill.',
        });
        return;
    }
    startLoading('Loading payment details...');
    try {
        const payment = await getPayment(reading.paymentId);
        if (payment) {
            setSelectedPayment(payment);
            setIsEditDialogOpen(true);
        } else {
            toast({ variant: 'destructive', title: 'Payment Not Found' });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch payment details.' });
    } finally {
        stopLoading();
    }
  };

  const handleSaveEdit = async (paymentId: string, data: EditFormValues) => {
    if (!userProfile?.id || !selectedPayment?.tenantId) return;

    startLoading('Updating payment record...');
    try {
        await updatePayment(
            paymentId,
            { amount: data.amount, date: format(data.date, 'yyyy-MM-dd'), notes: data.notes },
            data.reason,
            userProfile.id
        );

        if (selectedPayment.waterReadingId) {
             const readingRef = doc(db, 'waterReadings', selectedPayment.waterReadingId);
             await updateDoc(readingRef, { amount: data.amount });
        }
        
        await forceRecalculateTenantBalance(selectedPayment.tenantId);
        
        toast({ title: "Payment Updated", description: "The payment has been successfully updated."});
        fetchData(); 
        setIsEditDialogOpen(false);
    } catch(error) {
         toast({ variant: 'destructive', title: 'Error', description: 'Failed to update payment.' });
    } finally {
        stopLoading();
    }
  };
  
  const handleSendBills = async () => {
    if (!userProfile?.id) return;
    setIsConfirmSendOpen(false);
    startLoading(`Sending ${selectedReadings.length} bill(s)...`);
    try {
        const result = await performSendWaterBills(selectedReadings, userProfile.id);
        if (result.success) {
            toast({ title: 'Bills Sent', description: `${result.sentCount} water bill(s) have been successfully emailed.` });
            setSelectedReadings([]);
        } else {
            toast({ variant: 'destructive', title: 'Sending Failed', description: result.error });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
        stopLoading();
    }
  }
  
  const toggleSelectAll = () => {
    if (selectedReadings.length === paginatedReadings.length) {
        setSelectedReadings([]);
    } else {
        setSelectedReadings(paginatedReadings.map(r => r.id));
    }
  };

  const filteredReadings = useMemo(() => {
    return allReadings.filter(r => {
        const propertyMatch = recordsSelectedProperty === 'all' || r.propertyId === recordsSelectedProperty;
        const statusMatch = statusFilter === 'all' || (r.status || 'Pending') === statusFilter;
        const searchMatch = !searchTerm || 
            r.unitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.tenantName || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        return propertyMatch && statusMatch && searchMatch;
    });
  }, [allReadings, recordsSelectedProperty, statusFilter, searchTerm]);

  const paginatedReadings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReadings.slice(start, start + pageSize);
  }, [filteredReadings, currentPage, pageSize]);
  
  const totalPages = Math.ceil(filteredReadings.length / pageSize);

  return (
    <>
    <Tabs defaultValue="owner-bills" className="space-y-4">
        <div className="flex items-center justify-between">
             <div>
                <h2 className="text-3xl font-bold tracking-tight">Megarack - Water Management</h2>
                <p className="text-muted-foreground">Manage water meter readings and billing records.</p>
            </div>
            <TabsList>
                <TabsTrigger value="owner-bills">Owner Bills</TabsTrigger>
                <TabsTrigger value="all-records">All Records</TabsTrigger>
                <TabsTrigger value="add">Add Reading</TabsTrigger>
            </TabsList>
        </div>
        <TabsContent value="owner-bills">
            <Card>
                <CardHeader>
                    <CardTitle>Consolidated Owner Bills</CardTitle>
                    <CardDescription>Pending water bills grouped by owner for easy consolidated payments.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingRecords ? (
                         <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : ownerBills.length > 0 ? (
                        <div className="space-y-4">
                           {ownerBills.map(bill => (
                               <Collapsible key={bill.owner.id} className="border rounded-lg">
                                   <div className="flex items-center justify-between p-4">
                                       <div className="flex items-center gap-4">
                                            <div className="p-2 bg-muted rounded-full">
                                                <User className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                               <h4 className="font-semibold">{bill.owner.name}</h4>
                                               <p className="text-sm text-muted-foreground">{bill.readings.length} pending bill(s)</p>
                                            </div>
                                       </div>
                                       <div className="flex items-center gap-4">
                                            <div>
                                               <p className="text-sm text-muted-foreground text-right">Total Due</p>
                                               <p className="font-bold text-lg text-destructive text-right">Ksh {bill.totalDue.toLocaleString()}</p>
                                            </div>
                                            <Button onClick={() => handleOpenConsolidatedPayment(bill)}>Record Payment</Button>
                                            <CollapsibleTrigger asChild>
                                               <Button variant="ghost" size="sm">
                                                   <ChevronDown className="h-4 w-4" />
                                                   <span className="sr-only">Toggle details</span>
                                               </Button>
                                           </CollapsibleTrigger>
                                       </div>
                                   </div>
                                   <CollapsibleContent className="px-4 pb-4">
                                       <Table>
                                           <TableHeader>
                                               <TableRow>
                                                   <TableHead>Unit</TableHead>
                                                   <TableHead>Reading Date</TableHead>
                                                   <TableHead>Consumption</TableHead>
                                                   <TableHead className="text-right">Amount Due</TableHead>
                                               </TableRow>
                                           </TableHeader>
                                           <TableBody>
                                               {bill.readings.map(r => (
                                                   <TableRow key={r.id}>
                                                       <TableCell>{r.unitName} ({r.propertyName})</TableCell>
                                                       <TableCell>{format(new Date(r.date), 'PPP')}</TableCell>
                                                       <TableCell>{r.consumption} units</TableCell>
                                                       <TableCell className="text-right">Ksh {r.amount.toLocaleString()}</TableCell>
                                                   </TableRow>
                                               ))}
                                           </TableBody>
                                       </Table>
                                   </CollapsibleContent>
                               </Collapsible>
                           ))}
                        </div>
                    ) : (
                        <div className="text-center py-16 text-muted-foreground">No owners with pending water bills found.</div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="all-records">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                       <div className="flex-1 flex flex-wrap items-center gap-2">
                           {selectedReadings.length > 0 && (
                                <Button size="sm" onClick={() => setIsConfirmSendOpen(true)}>
                                    <Mail className="mr-2 h-4 w-4" />
                                    Send {selectedReadings.length} Bill(s)
                                </Button>
                           )}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by unit or tenant..."
                                    className="pl-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                       </div>
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <Select value={recordsSelectedProperty} onValueChange={setRecordsSelectedProperty}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <SelectValue placeholder="Filter by property..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Properties</SelectItem>
                                    {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="Filter by status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="Paid">Paid</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12 text-center">
                                    <Checkbox
                                        checked={selectedReadings.length === paginatedReadings.length && paginatedReadings.length > 0}
                                        onCheckedChange={toggleSelectAll}
                                    />
                                </TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Tenant</TableHead>
                                <TableHead className="text-right">Prior Rd.</TableHead>
                                <TableHead className="text-right">Current Rd.</TableHead>
                                <TableHead className="text-right">Consump.</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingRecords ? (
                                <TableRow>
                                    <TableCell colSpan={11} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedReadings.length > 0 ? (
                                paginatedReadings.map(reading => {
                                    const isPaid = (reading.status || 'Pending') === 'Paid';
                                    return (
                                    <TableRow key={reading.id} data-state={selectedReadings.includes(reading.id) ? 'selected' : ''}>
                                         <TableCell className="text-center">
                                            <Checkbox
                                                checked={selectedReadings.includes(reading.id)}
                                                onCheckedChange={(checked) => {
                                                    setSelectedReadings(prev => 
                                                        checked ? [...prev, reading.id] : prev.filter(id => id !== reading.id)
                                                    );
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>{format(new Date(reading.date), 'dd/MM/yy')}</TableCell>
                                        <TableCell className="font-medium">{reading.unitName}</TableCell>
                                        <TableCell>{reading.tenantName}</TableCell>
                                        <TableCell className="text-right">{reading.priorReading}</TableCell>
                                        <TableCell className="text-right">{reading.currentReading}</TableCell>
                                        <TableCell className="text-right font-medium">{reading.consumption} units</TableCell>
                                        <TableCell className="text-right">@{reading.rate}</TableCell>
                                        <TableCell className="text-right font-bold">Ksh {reading.amount.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge variant={isPaid ? 'default' : 'destructive'}>
                                                {reading.status || 'Pending'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {isPaid ? (
                                                <Button size="sm" variant="outline" onClick={() => handleEditClick(reading)}>
                                                    <Edit2 className="mr-2 h-4 w-4" />
                                                    Edit
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="default" onClick={() => handleRecordPaymentClick(reading)}>
                                                    <PlusCircle className="mr-2 h-4 w-4" />
                                                    Pay
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={11} className="h-24 text-center">
                                        No records found for the selected filters.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                {totalPages > 1 && (
                    <div className="p-4 border-t">
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalItems={filteredReadings.length}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={setPageSize}
                        />
                    </div>
                )}
            </Card>
        </TabsContent>
        <TabsContent value="add">
            <Card className="w-full max-w-lg mx-auto">
                <CardHeader>
                <CardTitle>Add Water Meter Reading</CardTitle>
                <CardDescription>Enter the new water meter reading for a tenant's unit.</CardDescription>
                </CardHeader>
                <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                    <Label htmlFor="development">Development</Label>
                    <Select onValueChange={setFormSelectedProperty} value={formSelectedProperty}>
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

                    <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="floor">Floor</Label>
                        <Select onValueChange={setSelectedFloor} value={selectedFloor} disabled={!formSelectedProperty}>
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
                            {unitsOnFloor.map(unit => (
                            <SelectItem key={unit.name} value={unit.name}>{unit.name}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reading-date">Reading Date</Label>
                        <DatePicker id="reading-date" value={readingDate} onChange={setReadingDate} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="prior-reading">Prior Reading</Label>
                        <div className="relative">
                            <Input
                            id="prior-reading"
                            type="number"
                            value={priorReading === null ? '' : priorReading}
                            readOnly
                            className="bg-muted font-medium"
                            />
                            {isPriorReadingLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                        {priorReadingSource && <p className="text-xs text-muted-foreground pt-1">{priorReadingSource}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="current-reading">Current Reading</Label>
                        <Input
                        id="current-reading"
                        type="number"
                        value={currentReading}
                        onChange={(e) => setCurrentReading(e.target.value)}
                        placeholder="e.g., 1250"
                        required
                        disabled={priorReading === null}
                        />
                    </div>
                    </div>
                    
                    {consumption > 0 && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                            <p className="text-sm text-blue-800">Consumption: <span className="font-bold">{consumption} units</span></p>
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Reading
                    </Button>
                </form>
                </CardContent>
            </Card>
        </TabsContent>
    </Tabs>

    <AddPaymentDialog
        open={isPaymentDialogOpen}
        onOpenChange={(isOpen) => {
            setIsPaymentDialogOpen(isOpen);
            if (!isOpen) setSelectedReadingForPayment(null);
        }}
        tenant={selectedTenantForPayment}
        properties={properties}
        tenants={tenants}
        onPaymentAdded={handlePaymentAdded}
        defaultPaymentType="Water"
        allReadings={allReadings}
        readingForPayment={selectedReadingForPayment}
    />

    <EditPaymentDialog 
        payment={selectedPayment}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSave={handleSaveEdit}
    />
    
    {selectedOwnerBill && (
        <ConfirmOwnerWaterPaymentDialog
            isOpen={isConsolidatedPaymentOpen}
            onClose={() => setIsConsolidatedPaymentOpen(false)}
            ownerBill={selectedOwnerBill}
            onConfirm={handleConfirmConsolidatedPayment}
            isSaving={isActionLoading}
        />
    )}
    
    <AlertDialog open={isConfirmSendOpen} onOpenChange={setIsConfirmSendOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Confirm Sending Bills</AlertDialogTitle>
                <AlertDialogDescription>
                    You are about to email water bills to {selectedReadings.length} resident(s). Are you sure you want to proceed?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSendBills} disabled={isActionLoading}>
                    {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Send
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
