
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addWaterMeterReading, getLatestWaterReading, getPropertyWaterReadings, getTenants } from '@/lib/data';
import type { Property, WaterMeterReading, Tenant } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, PlusCircle } from 'lucide-react';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';
import { format } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';


interface WaterReadingRecord extends WaterMeterReading {
    tenantName?: string;
    propertyName?: string;
}

export default function MegarackPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // Common state
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  
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
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsSelectedProperty, setRecordsSelectedProperty] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedTenantForPayment, setSelectedTenantForPayment] = useState<Tenant | null>(null);

  // Combined data fetching
  const fetchData = async () => {
        setLoadingRecords(true);
        const [propsData, tenantsData] = await Promise.all([getProperties(true), getTenants()]);
        setProperties(propsData);
        setTenants(tenantsData);

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
  const { startLoading, stopLoading } = useLoading();

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
      const recordsTab = document.querySelector('button[data-state="inactive"][value="records"]');
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
          setIsPaymentDialogOpen(true);
      } else {
          toast({
              variant: 'destructive',
              title: 'Tenant not found',
              description: 'Could not find an active tenant for this water reading.',
          });
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
    <Tabs defaultValue="records" className="space-y-4">
        <div className="flex items-center justify-between">
             <div>
                <h2 className="text-3xl font-bold tracking-tight">Megarack - Water Management</h2>
                <p className="text-muted-foreground">Manage water meter readings and billing records.</p>
            </div>
            <TabsList>
                <TabsTrigger value="records">Records</TabsTrigger>
                <TabsTrigger value="add">Add Reading</TabsTrigger>
            </TabsList>
        </div>
        <TabsContent value="records">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by unit or tenant..."
                                className="pl-10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
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
                                <TableHead>Unit</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Prior Reading</TableHead>
                                <TableHead>Current Reading</TableHead>
                                <TableHead>Units Consumed</TableHead>
                                <TableHead>Payable Amount</TableHead>
                                <TableHead>Payment Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingRecords ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedReadings.length > 0 ? (
                                paginatedReadings.map(reading => (
                                    <TableRow key={reading.id}>
                                        <TableCell className="font-medium">
                                            <div>{reading.unitName}</div>
                                            <div className="text-xs text-muted-foreground">{reading.propertyName}</div>
                                        </TableCell>
                                        <TableCell>{reading.tenantName}</TableCell>
                                        <TableCell>{reading.priorReading}</TableCell>
                                        <TableCell>{reading.currentReading}</TableCell>
                                        <TableCell className="font-semibold">{reading.consumption} units</TableCell>
                                        <TableCell>Ksh {reading.amount.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge variant={(reading.status || 'Pending') === 'Paid' ? 'default' : 'destructive'}>
                                                {reading.status || 'Pending'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                disabled={(reading.status || 'Pending') === 'Paid'}
                                                onClick={() => handleRecordPaymentClick(reading)}
                                            >
                                                <PlusCircle className="mr-2 h-4 w-4" />
                                                Record Payment
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
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
                        <DatePicker value={readingDate} onChange={setReadingDate} />
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
        onOpenChange={setIsPaymentDialogOpen}
        tenant={selectedTenantForPayment}
        properties={properties}
        tenants={tenants}
        onPaymentAdded={handlePaymentAdded}
        defaultPaymentType="Water"
        allReadings={allReadings}
    />
    </>
  );
}




