
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getTenantsInArrears } from '@/lib/arrears';
import { getProperties } from '@/lib/data';
import type { Tenant, Property } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Bell, FileDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useToast } from '@/hooks/use-toast';
import { downloadCSV } from '@/lib/utils';
import { performSendArrearsReminder } from '@/app/actions';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TenantWithArrears {
  tenant: Tenant;
  arrears: number;
}

export default function ArrearsPage() {
  const [arrearsData, setArrearsData] = useState<TenantWithArrears[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationStatus, setNotificationStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});

  // State for Rent Arrears tab
  const [rentSearchTerm, setRentSearchTerm] = useState('');
  const [rentCurrentPage, setRentCurrentPage] = useState(1);
  const [rentPageSize, setRentPageSize] = useState(10);
  
  // State for Service Charge Arrears tab
  const [scSearchTerm, setScSearchTerm] = useState('');
  const [scCurrentPage, setScCurrentPage] = useState(1);
  const [scPageSize, setScPageSize] = useState(10);

  const { toast } = useToast();
  const { user } = useAuth();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [arrears, props] = await Promise.all([
        getTenantsInArrears(),
        getProperties()
      ]);
      setArrearsData(arrears);
      setProperties(props);
    } catch (error) {
      console.error("Failed to fetch arrears data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch arrears data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getPropertyName = (propertyId: string) => {
    return properties.find(p => p.id === propertyId)?.name || 'N/A';
  };
  
  const handleSendReminder = async (tenant: Tenant) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to send reminders.' });
        return;
    }
    
    setNotificationStatus(prev => ({...prev, [tenant.id]: 'sending'}));
    
    try {
        const result = await performSendArrearsReminder(tenant.id, user.uid);
        if (result.success) {
            toast({ title: 'Reminder Sent', description: `A payment reminder has been sent to ${tenant.name}.`});
            setNotificationStatus(prev => ({...prev, [tenant.id]: 'sent'}));
            setTimeout(() => {
                setNotificationStatus(prev => ({...prev, [tenant.id]: 'idle'}));
            }, 3000);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to send reminder.' });
            setNotificationStatus(prev => ({...prev, [tenant.id]: 'error'}));
        }
    } catch (error: any) {
        console.error('Error sending reminder:', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
        setNotificationStatus(prev => ({...prev, [tenant.id]: 'error'}));
    }
  };

  const rentArrearsData = useMemo(() => arrearsData.filter(({ tenant }) => tenant.residentType === 'Tenant'), [arrearsData]);
  const serviceChargeArrearsData = useMemo(() => arrearsData.filter(({ tenant }) => tenant.residentType === 'Homeowner'), [arrearsData]);
  
  const filteredRentData = useMemo(() => {
    if (!rentSearchTerm) return rentArrearsData;
    const lowercasedFilter = rentSearchTerm.toLowerCase();
    return rentArrearsData.filter(({ tenant }) =>
        tenant.name.toLowerCase().includes(lowercasedFilter) ||
        tenant.email.toLowerCase().includes(lowercasedFilter) ||
        getPropertyName(tenant.propertyId).toLowerCase().includes(lowercasedFilter)
    );
  }, [rentArrearsData, rentSearchTerm, properties]);
  
  const filteredScData = useMemo(() => {
    if (!scSearchTerm) return serviceChargeArrearsData;
    const lowercasedFilter = scSearchTerm.toLowerCase();
    return serviceChargeArrearsData.filter(({ tenant }) =>
        tenant.name.toLowerCase().includes(lowercasedFilter) ||
        tenant.email.toLowerCase().includes(lowercasedFilter) ||
        getPropertyName(tenant.propertyId).toLowerCase().includes(lowercasedFilter)
    );
  }, [serviceChargeArrearsData, scSearchTerm, properties]);

  const totalPagesRent = Math.ceil(filteredRentData.length / rentPageSize);
  const paginatedRentData = filteredRentData.slice((rentCurrentPage - 1) * rentPageSize, rentCurrentPage * rentPageSize);

  const totalPagesSc = Math.ceil(filteredScData.length / scPageSize);
  const paginatedScData = filteredScData.slice((scCurrentPage - 1) * scPageSize, scCurrentPage * scPageSize);

  const totalArrears = useMemo(() => arrearsData.reduce((sum, item) => sum + item.arrears, 0), [arrearsData]);
  
  const getButtonState = (status: 'idle' | 'sending' | 'sent' | 'error' | undefined) => {
    switch (status) {
      case 'sending':
        return { text: 'Sending...', disabled: true, variant: 'outline' as const };
      case 'sent':
        return { text: 'Sent!', disabled: true, variant: 'default' as const };
      case 'error':
        return { text: 'Retry', disabled: false, variant: 'destructive' as const };
      case 'idle':
      default:
        return { text: 'Send Reminder', disabled: false, variant: 'outline' as const };
    }
  };

  const ArrearsTable = ({
      data,
      paginatedData,
      title,
      description,
      searchTerm,
      onSearchTermChange,
      currentPage,
      onPageChange,
      pageSize,
      onPageSizeChange,
      totalPages,
      totalItems,
      csvFileName,
    }: {
      data: TenantWithArrears[];
      paginatedData: TenantWithArrears[];
      title: string;
      description: string;
      searchTerm: string;
      onSearchTermChange: (term: string) => void;
      currentPage: number;
      onPageChange: (page: number) => void;
      pageSize: number;
      onPageSizeChange: (size: number) => void;
      totalPages: number;
      totalItems: number;
      csvFileName: string;
  }) => (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <CardTitle>{title} ({totalItems})</CardTitle>
                <CardDescription>{description}</CardDescription>
            </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative w-full sm:w-[300px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by tenant, property..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => onSearchTermChange(e.target.value)}
                    />
                </div>
                  <Button variant="outline" size="sm" onClick={() => downloadCSV(data.map(d => ({ Name: d.tenant.name, Email: d.tenant.email, Property: getPropertyName(d.tenant.propertyId), Unit: d.tenant.unitName, Arrears: d.arrears })), csvFileName)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export
                </Button>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile View */}
        <div className="md:hidden">
            {paginatedData.map(({ tenant, arrears }) => {
                const status = notificationStatus[tenant.id] || 'idle';
                const buttonState = getButtonState(status);
                return (
                    <div key={tenant.id} className="border-b p-4 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="font-medium">{tenant.name}</div>
                                <div className="text-sm text-muted-foreground">{tenant.email}</div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-red-600">Ksh {arrears.toLocaleString()}</div>
                                <div className="text-xs text-muted-foreground">Arrears</div>
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {getPropertyName(tenant.propertyId)} - Unit {tenant.unitName}
                        </div>
                        <Button
                            size="sm"
                            variant={buttonState.variant}
                            disabled={buttonState.disabled}
                            onClick={() => handleSendReminder(tenant)}
                            className="w-full h-11 text-base"
                        >
                            <Bell className="mr-2 h-4 w-4" />
                            {buttonState.text}
                        </Button>
                    </div>
                );
            })}
        </div>
        {/* Desktop View */}
        <Table className="hidden md:table">
            <TableHeader>
                <TableRow>
                    <TableHead>Resident</TableHead>
                    <TableHead>Property / Unit</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead className="text-right">Total Arrears</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {paginatedData.map(({ tenant, arrears }) => {
                    const status = notificationStatus[tenant.id] || 'idle';
                    const buttonState = getButtonState(status);
                    return (
                        <TableRow key={tenant.id}>
                            <TableCell>
                                <div className="font-medium">{tenant.name}</div>
                                <div className="text-sm text-muted-foreground">{tenant.email}</div>
                            </TableCell>
                            <TableCell>
                                <div>{getPropertyName(tenant.propertyId)}</div>
                                <div className="text-sm text-muted-foreground">Unit {tenant.unitName}</div>
                            </TableCell>
                            <TableCell>
                                {tenant.lease.lastPaymentDate ? new Date(tenant.lease.lastPaymentDate).toLocaleDateString() : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-red-600">
                                Ksh {arrears.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    size="sm"
                                    variant={buttonState.variant}
                                    disabled={buttonState.disabled}
                                    onClick={() => handleSendReminder(tenant)}
                                >
                                    <Bell className="mr-2 h-4 w-4" />
                                    {buttonState.text}
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
                {paginatedData.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                            No residents match your search.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
      </CardContent>
        <div className="p-4 border-t">
        <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalItems}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
        />
      </div>
    </Card>
  );

  if (loading) {
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Rent & Service Charge Arrears</h2>
                <p className="text-muted-foreground">A list of all residents with outstanding balances.</p>
            </div>
            <Card className="p-4 w-full md:w-auto">
                <div className="text-sm font-medium text-muted-foreground">Total Combined Arrears</div>
                <div className="text-2xl font-bold text-red-600">Ksh {totalArrears.toLocaleString()}</div>
            </Card>
        </div>

        <Tabs defaultValue="rent" className="space-y-4">
            <TabsList>
                <TabsTrigger value="rent">Rent Arrears</TabsTrigger>
                <TabsTrigger value="service-charge">Service Charge Arrears</TabsTrigger>
            </TabsList>
            <TabsContent value="rent">
                <ArrearsTable
                    data={filteredRentData}
                    paginatedData={paginatedRentData}
                    title="Tenants in Arrears"
                    description="A list of all tenants with overdue rent balances."
                    searchTerm={rentSearchTerm}
                    onSearchTermChange={setRentSearchTerm}
                    currentPage={rentCurrentPage}
                    onPageChange={setRentCurrentPage}
                    pageSize={rentPageSize}
                    onPageSizeChange={setRentPageSize}
                    totalPages={totalPagesRent}
                    totalItems={filteredRentData.length}
                    csvFileName="rent_arrears_report.csv"
                />
            </TabsContent>
            <TabsContent value="service-charge">
                <ArrearsTable
                    data={filteredScData}
                    paginatedData={paginatedScData}
                    title="Homeowners in Arrears"
                    description="A list of all homeowners with overdue service charge balances."
                    searchTerm={scSearchTerm}
                    onSearchTermChange={setScSearchTerm}
                    currentPage={scCurrentPage}
                    onPageChange={setScCurrentPage}
                    pageSize={scPageSize}
                    onPageSizeChange={setScPageSize}
                    totalPages={totalPagesSc}
                    totalItems={filteredScData.length}
                    csvFileName="service_charge_arrears_report.csv"
                />
            </TabsContent>
        </Tabs>
    </div>
  );
}
