
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

interface TenantWithArrears {
  tenant: Tenant;
  arrears: number;
}

export default function ArrearsPage() {
  const [arrearsData, setArrearsData] = useState<TenantWithArrears[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [notificationStatus, setNotificationStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});

  const { toast } = useToast();
  const { user } = useAuth();

  const fetchData = async () => {
    try {
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
            throw new Error(result.error);
        }
    } catch (error: any) {
        console.error('Error sending reminder:', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to send reminder.' });
        setNotificationStatus(prev => ({...prev, [tenant.id]: 'error'}));
    }
  };

  const filteredData = useMemo(() => {
    if (!searchTerm) return arrearsData;
    const lowercasedFilter = searchTerm.toLowerCase();
    return arrearsData.filter(({ tenant }) =>
        tenant.name.toLowerCase().includes(lowercasedFilter) ||
        tenant.email.toLowerCase().includes(lowercasedFilter) ||
        getPropertyName(tenant.propertyId).toLowerCase().includes(lowercasedFilter)
    );
  }, [arrearsData, searchTerm, properties]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalArrears = useMemo(() => filteredData.reduce((sum, item) => sum + item.arrears, 0), [filteredData]);
  
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

  if (loading) {
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Rent & Service Charge Arrears</h2>
                <p className="text-muted-foreground">A list of all residents with outstanding balances (rent, service charges, etc.).</p>
            </div>
            <Card className="p-4">
                <div className="text-sm font-medium text-muted-foreground">Total Arrears</div>
                <div className="text-2xl font-bold text-red-600">Ksh {totalArrears.toLocaleString()}</div>
            </Card>
        </div>

        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Residents in Arrears ({filteredData.length})</CardTitle>
                        <CardDescription>A list of all residents with overdue balances.</CardDescription>
                    </div>
                     <div className="flex items-center gap-2">
                        <div className="relative w-full sm:w-[300px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by tenant, property..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                         <Button variant="outline" size="sm" onClick={() => downloadCSV(filteredData.map(d => ({ Name: d.tenant.name, Email: d.tenant.email, Property: getPropertyName(d.tenant.propertyId), Unit: d.tenant.unitName, Arrears: d.arrears })), 'arrears_report.csv')}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Export CSV
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tenant</TableHead>
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
                                    No tenants in arrears match your search.
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
                    totalItems={filteredData.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </div>
        </Card>
    </div>
  );
}
