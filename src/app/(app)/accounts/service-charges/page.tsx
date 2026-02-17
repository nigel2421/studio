
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getProperties, getPropertyOwners, getTenants, getAllPaymentsForReport, getLandlords, getAllWaterReadings } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment, Landlord, WaterMeterReading } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, MoreHorizontal, CheckCircle, ChevronLeft, ChevronRight, FileText, Eye, ChevronDown, FileSignature, PlusCircle, Building2, AlertCircle, PieChart, DollarSign } from 'lucide-react';
import { isSameMonth, startOfMonth, format, addMonths, subMonths, isAfter, parseISO, isValid } from 'date-fns';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmOwnerPaymentDialog } from '@/components/financials/confirm-owner-payment-dialog';
import { OwnerTransactionHistoryDialog } from '@/components/financials/owner-transaction-history-dialog';
import {
    groupAccounts,
    processServiceChargeData,
    ServiceChargeAccount,
    GroupedServiceChargeAccount,
    VacantArrearsAccount,
} from '@/lib/service-charge';


export default function ServiceChargesPage() {
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allOwners, setAllOwners] = useState<PropertyOwner[]>([]);
  const [allLandlords, setAllLandlords] = useState<Landlord[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);

  const [clientOccupiedAccounts, setClientOccupiedAccounts] = useState<GroupedServiceChargeAccount[]>([]);
  const [managedVacantAccounts, setManagedVacantAccounts] = useState<GroupedServiceChargeAccount[]>([]);
  const [arrearsAccounts, setArrearsAccounts] = useState<VacantArrearsAccount[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [smCurrentPage, setSmCurrentPage] = useState(1);
  const [smPageSize, setSmPageSize] = useState(10);
  const [smStatusFilter, setSmStatusFilter] = useState<'all' | 'Paid' | 'Pending' | 'N/A'>('all');

  const [mvCurrentPage, setMvCurrentPage] = useState(1);
  const [mvPageSize, setMvPageSize] = useState(10);
  const [mvStatusFilter, setMvStatusFilter] = useState<'all' | 'Paid' | 'Pending' | 'N/A'>('all');

  const [arrearsCurrentPage, setArrearsCurrentPage] = useState(1);
  const [arrearsPageSize, setArrearsPageSize] = useState(10);
  
  const { startLoading, stopLoading, isLoading: isSaving } = useLoading();
  const { toast } = useToast();

  const [isOwnerPaymentDialogOpen, setIsOwnerPaymentDialogOpen] = useState(false);
  const [ownerForPayment, setOwnerForPayment] = useState<PropertyOwner | Landlord | null>(null);
  const [accountsForPayment, setAccountsForPayment] = useState<ServiceChargeAccount[]>([]);
  const [totalBalanceForDialog, setTotalBalanceForDialog] = useState(0);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [ownerForHistory, setOwnerForHistory] = useState<PropertyOwner | Landlord | null>(null);
  const [statusForHistory, setStatusForHistory] = useState<'Paid' | 'Pending' | 'N/A' | null>(null);

  const [activeTab, setActiveTab] = useState('client-occupied');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');

  const fetchData = useCallback(async () => {
    try {
      const [propertiesData, ownersData, tenantsData, paymentsData, landlordsData] = await Promise.all([
        getProperties(),
        getPropertyOwners(),
        getTenants(),
        getAllPaymentsForReport(),
        getLandlords(),
      ]);
      
      setAllProperties(propertiesData);
      setAllOwners(ownersData);
      setAllTenants(tenantsData);
      setAllPayments(paymentsData);
      setAllLandlords(landlordsData);

    } catch (error) {
      console.error("Failed to fetch service charge data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load page data.'})
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  useEffect(() => {
    if (loading) return;

    const propsToProcess = selectedPropertyId === 'all'
        ? allProperties
        : allProperties.filter(p => p.id === selectedPropertyId);

    const {
        clientOccupiedServiceChargeAccounts,
        managedVacantServiceChargeAccounts,
        vacantArrears,
    } = processServiceChargeData(
        propsToProcess,
        allOwners,
        allTenants,
        allPayments,
        allLandlords,
        new Date()
    );

    setClientOccupiedAccounts(groupAccounts(clientOccupiedServiceChargeAccounts));
    setManagedVacantAccounts(groupAccounts(managedVacantServiceChargeAccounts));
    setArrearsAccounts(vacantArrears);

  }, [loading, allProperties, allOwners, allTenants, allPayments, allLandlords, selectedPropertyId]);


  const serviceChargeProperties = useMemo(() => {
    const relevantPropertyIds = new Set<string>();
    allProperties.forEach(p => {
        if (p.units.some(u => (u.managementStatus === 'Client Managed' || u.managementStatus === 'Rented for Clients') && u.serviceCharge && u.serviceCharge > 0)) {
            relevantPropertyIds.add(p.id);
        }
    });
    return allProperties.filter(p => relevantPropertyIds.has(p.id));
  }, [allProperties]);


  const displayedStats = useMemo(() => {
      let sourceAccounts: ServiceChargeAccount[] = [];
      if (activeTab === 'client-occupied') {
          sourceAccounts = clientOccupiedAccounts.flatMap(g => g.units);
      } else if (activeTab === 'managed-vacant') {
          sourceAccounts = managedVacantAccounts.flatMap(g => g.units);
      }
      
      if (activeTab === 'arrears') {
          const totalArrears = arrearsAccounts.reduce((sum, acc) => sum + acc.totalDue, 0);
          return [
              { title: 'Owners with Arrears', value: arrearsAccounts.length.toString(), icon: Building2 },
              { title: 'Total Arrears Due', value: `Ksh ${totalArrears.toLocaleString()}`, icon: AlertCircle },
          ];
      }
      
      const paidAccounts = sourceAccounts.filter(a => a.paymentStatus === 'Paid');
      const pendingAccounts = sourceAccounts.filter(a => a.paymentStatus === 'Pending');
  
      const totalPaid = paidAccounts.reduce((sum, acc) => sum + acc.unitServiceCharge, 0);
      const totalPending = pendingAccounts.reduce((sum, acc) => sum + acc.unitServiceCharge, 0);
      const totalCharged = totalPaid + totalPending;
      const paidPercentage = totalCharged > 0 ? (totalPaid / totalCharged) * 100 : 0;
      
      return [
           { title: activeTab === 'client-occupied' ? 'Client Occupied Units' : 'Managed Vacant Units', value: sourceAccounts.length.toString(), icon: Building2 },
           { title: 'Paid This Month', value: `Ksh ${totalPaid.toLocaleString()}`, icon: DollarSign },
           { title: 'Pending This Month', value: `Ksh ${totalPending.toLocaleString()}`, icon: AlertCircle },
           { title: 'Collection Rate', value: `${paidPercentage.toFixed(1)}%`, icon: PieChart },
      ];
  }, [activeTab, clientOccupiedAccounts, managedVacantAccounts, arrearsAccounts]);
  
  const finalFilteredSelfManaged = useMemo(() => {
    let accounts = clientOccupiedAccounts;
    if (smStatusFilter !== 'all') {
      accounts = accounts.filter(group => group.paymentStatus === smStatusFilter);
    }
    if (searchTerm) {
        const lowercasedFilter = searchTerm.toLowerCase();
        accounts = accounts.filter(group =>
            group.ownerName?.toLowerCase().includes(lowercasedFilter) ||
            group.units.some(u => u.unitName.toLowerCase().includes(lowercasedFilter) || u.propertyName.toLowerCase().includes(lowercasedFilter))
        );
    }
    return accounts;
  }, [clientOccupiedAccounts, searchTerm, smStatusFilter]);

  const finalFilteredManagedVacant = useMemo(() => {
    let accounts = managedVacantAccounts;
    if (mvStatusFilter !== 'all') {
        accounts = accounts.filter(group => group.paymentStatus === mvStatusFilter);
    }
    if (searchTerm) {
        const lowercasedFilter = searchTerm.toLowerCase();
        accounts = accounts.filter(group =>
            group.ownerName?.toLowerCase().includes(lowercasedFilter) ||
            group.units.some(u => u.unitName.toLowerCase().includes(lowercasedFilter) || u.propertyName.toLowerCase().includes(lowercasedFilter))
        );
    }
    return accounts;
  }, [managedVacantAccounts, searchTerm, mvStatusFilter]);

  const finalFilteredArrears = useMemo(() => {
    let accounts = arrearsAccounts;
    if (!searchTerm) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(acc =>
        acc.ownerName.toLowerCase().includes(lowercasedFilter) ||
        acc.units.some(u => u.unitName.toLowerCase().includes(lowercasedFilter) || u.propertyName.toLowerCase().includes(lowercasedFilter))
    );
  }, [arrearsAccounts, searchTerm]);

  const smTotalPages = Math.ceil(finalFilteredSelfManaged.length / smPageSize);
  const paginatedSmAccounts = finalFilteredSelfManaged.slice((smCurrentPage - 1) * smPageSize, smCurrentPage * smPageSize);

  const mvTotalPages = Math.ceil(finalFilteredManagedVacant.length / mvPageSize);
  const paginatedMvAccounts = finalFilteredManagedVacant.slice((mvCurrentPage - 1) * mvPageSize, mvCurrentPage * mvPageSize);

  const arrearsTotalPages = Math.ceil(finalFilteredArrears.length / arrearsPageSize);
  const paginatedArrears = finalFilteredArrears.slice((arrearsCurrentPage - 1) * arrearsPageSize, arrearsCurrentPage * arrearsPageSize);

  const handleOpenHistoryDialog = (group: GroupedServiceChargeAccount) => {
    let ownerForDialog: PropertyOwner | Landlord | undefined;
    ownerForDialog = allOwners.find(o => o.id === group.ownerId) || allLandlords.find(l => l.id === group.ownerId);
    
    if (ownerForDialog) {
        setOwnerForHistory(ownerForDialog);
        setStatusForHistory(group.paymentStatus);
        setIsHistoryOpen(true);
    } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Owner details not found.' });
    }
  };

  const handleOpenOwnerPaymentDialog = async (account: ServiceChargeAccount) => {
    // This function will need to be re-implemented as it relied on old data structure
  };

  const handleConfirmOwnerPayment = async (paymentData: { amount: number; date: Date, notes: string, forMonth: string; paymentMethod: Payment['paymentMethod'], transactionId: string }) => {
     // This function will need to be re-implemented as it relied on old data structure
  }

  const handleGenerateInvoice = async (group: VacantArrearsAccount) => {
    const { generateVacantServiceChargeInvoicePDF } = await import('@/lib/pdf-generator');
    
    const unitsWithArrears = group.units.map(u => ({
        unit: u.unit,
        property: u.property,
        arrearsDetail: u.arrearsDetail,
        totalDue: u.totalDue
    }));

    generateVacantServiceChargeInvoicePDF(group.owner, unitsWithArrears, group.totalDue);
    toast({ title: 'Invoice Generated', description: `Invoice for ${group.ownerName} has been downloaded.` });
  };
  
  const handleSmStatusFilterChange = useCallback((status: 'all' | 'Paid' | 'Pending' | 'N/A') => {
    setSmStatusFilter(status);
    setSmCurrentPage(1);
  }, []);

  const handleMvStatusFilterChange = useCallback((status: 'all' | 'Paid' | 'Pending' | 'N/A') => {
    setMvStatusFilter(status);
    setMvCurrentPage(1);
  }, []);

  const statusFilterNode = useMemo(() => {
      if (activeTab === 'arrears') return null;
      const isSm = activeTab === 'client-occupied';
      const filterValue = isSm ? smStatusFilter : mvStatusFilter;
      const handler = isSm ? handleSmStatusFilterChange : handleMvStatusFilterChange;
      
      return (
        <Select value={filterValue} onValueChange={handler}>
            <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="N/A">Not Billable</SelectItem>
            </SelectContent>
        </Select>
      );
  }, [activeTab, smStatusFilter, mvStatusFilter, handleSmStatusFilterChange, handleMvStatusFilterChange]);

  return (
    <div>
      <div className="sticky top-16 bg-background/95 backdrop-blur-sm z-10 py-6 -mt-6">
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Client Service Charges</h2>
                <p className="text-muted-foreground">Track service charge payments for all client-owned units.</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                  <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                      <SelectTrigger className="w-full sm:w-[240px]">
                          <SelectValue placeholder="Filter by property..." />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">All Properties</SelectItem>
                          {serviceChargeProperties.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
                  {statusFilterNode}
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {displayedStats.map((stat, index) => (
                    <Card key={index}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                        <stat.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
      </div>

      <div className="mt-6">
        <Tabs defaultValue="client-occupied" onValueChange={setActiveTab}>
          <div className="flex justify-between items-center">
              <TabsList>
                  <TabsTrigger value="client-occupied">Client Occupied</TabsTrigger>
                  <TabsTrigger value="managed-vacant">Managed Vacant</TabsTrigger>
                  <TabsTrigger value="arrears">Vacant Units in Arrears</TabsTrigger>
              </TabsList>
              <div className="relative w-full sm:w-[300px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                      placeholder="Search by unit, owner..."
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
          </div>
          <TabsContent value="client-occupied">
            <ServiceChargeStatusTable
                accounts={paginatedSmAccounts}
                onConfirmPayment={(acc) => handleOpenOwnerPaymentDialog(acc)}
                onViewHistory={handleOpenHistoryDialog}
                currentPage={smCurrentPage}
                pageSize={smPageSize}
                totalPages={smTotalPages}
                onPageChange={setSmCurrentPage}
                onPageSizeChange={setSmPageSize}
                totalItems={finalFilteredSelfManaged.length}
              />
          </TabsContent>
          <TabsContent value="managed-vacant">
              <ServiceChargeStatusTable
                accounts={paginatedMvAccounts}
                onConfirmPayment={(acc) => handleOpenOwnerPaymentDialog(acc)}
                onViewHistory={handleOpenHistoryDialog}
                currentPage={mvCurrentPage}
                pageSize={mvPageSize}
                totalPages={mvTotalPages}
                onPageChange={setMvCurrentPage}
                onPageSizeChange={setMvPageSize}
                totalItems={finalFilteredManagedVacant.length}
              />
          </TabsContent>
          <TabsContent value="arrears">
            <VacantArrearsTab
                arrears={paginatedArrears}
                onGenerateInvoice={handleGenerateInvoice}
                currentPage={arrearsCurrentPage}
                pageSize={arrearsPageSize}
                totalPages={arrearsTotalPages}
                onPageChange={setArrearsCurrentPage}
                onPageSizeChange={setArrearsPageSize}
                totalItems={finalFilteredArrears.length}
              />
          </TabsContent>
        </Tabs>
      </div>
      
      {ownerForPayment && (
        <ConfirmOwnerPaymentDialog
          isOpen={isOwnerPaymentDialogOpen}
          onClose={() => setIsOwnerPaymentDialogOpen(false)}
          ownerName={ownerForPayment.name}
          accounts={accountsForPayment}
          totalBalanceDue={totalBalanceForDialog}
          onConfirm={handleConfirmOwnerPayment}
          isSaving={isSaving}
        />
      )}
      {ownerForHistory && (
        <OwnerTransactionHistoryDialog
            open={isHistoryOpen}
            onOpenChange={setIsHistoryOpen}
            owner={ownerForHistory}
            allProperties={allProperties}
            allTenants={allTenants}
            allPayments={allPayments}
            selectedMonth={new Date()}
            paymentStatusForMonth={statusForHistory}
            onDataChange={fetchData}
        />
      )}
    </div>
  );
}

const ServiceChargeStatusTable = ({
    accounts,
    onConfirmPayment,
    onViewHistory,
    currentPage,
    pageSize,
    totalPages,
    onPageChange,
    onPageSizeChange,
    totalItems,
}: {
    accounts: GroupedServiceChargeAccount[];
    onConfirmPayment: (acc: ServiceChargeAccount) => void;
    onViewHistory: (group: GroupedServiceChargeAccount) => void;
    currentPage: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    totalItems: number;
}) => {
    const { toast } = useToast();

    const handleConfirmClick = (group: GroupedServiceChargeAccount) => {
        if (group.paymentStatus === 'N/A') {
            toast({
                variant: "destructive",
                title: "Cannot Record Payment",
                description: "This owner has no units that are billable for the selected month.",
            });
            return;
        }
        onConfirmPayment(group.units[0]);
    };
    
    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Owner</TableHead>
                            <TableHead>Units ({totalItems})</TableHead>
                            <TableHead>Total S. Charge</TableHead>
                            <TableHead>Payment Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {accounts.map(group => (
                            <TableRow key={group.groupId}>
                                <TableCell>{group.ownerName}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-2">
                                        {group.units.map(unit => (
                                            <div key={unit.unitName} className="text-xs">
                                                <span className="font-semibold">{unit.unitName}</span> ({unit.propertyName}) - <span className="font-mono">Ksh {unit.unitServiceCharge.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>Ksh {group.totalServiceCharge.toLocaleString()}</TableCell>
                                <TableCell>
                                     <Badge variant={
                                        group.paymentStatus === 'Paid' ? 'default' :
                                        group.paymentStatus === 'Pending' ? 'destructive' :
                                        group.paymentStatus === 'N/A' ? 'outline' :
                                        'secondary'
                                    }>
                                        {group.paymentStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8"
                                            onClick={() => onViewHistory(group)}
                                        >
                                            <FileSignature className="mr-2 h-4 w-4" />
                                            View Statement
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleConfirmClick(group)}
                                            disabled={group.paymentStatus === 'Paid' || group.paymentStatus === 'N/A'}
                                            className="h-8"
                                        >
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Record Payment
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                         {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No units match the criteria for this month.
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
};

const VacantArrearsTab = ({
    arrears,
    onGenerateInvoice,
    currentPage,
    pageSize,
    totalPages,
    onPageChange,
    onPageSizeChange,
    totalItems,
}: {
    arrears: VacantArrearsAccount[];
    onGenerateInvoice: (acc: VacantArrearsAccount) => void;
    currentPage: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    totalItems: number;
}) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Vacant Units in Arrears</CardTitle>
                <CardDescription>Handed-over units vacant with outstanding service charges.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Owner</TableHead>
                            <TableHead>Unit(s)</TableHead>
                            <TableHead>Handover Date</TableHead>
                            <TableHead>Months in Arrears</TableHead>
                            <TableHead>Total Due</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {arrears.map(group => {
                             const unitNames = group.units.map(u => u.unitName).join(', ');
                             const uniqueDates = [...new Set(group.units.map(u => new Date(u.unitHandoverDate).toLocaleDateString()))];
                             const handoverDateDisplay = uniqueDates.length === 1 ? uniqueDates[0] : 'Multiple';
                             const maxMonthsInArrears = Math.max(...group.units.map(u => u.monthsInArrears));
                            return (
                            <TableRow key={group.ownerId}>
                                <TableCell>
                                    <div className="font-medium">{group.ownerName}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium">{unitNames}</div>
                                </TableCell>
                                <TableCell>
                                   {handoverDateDisplay}
                                </TableCell>
                                <TableCell>
                                    {maxMonthsInArrears}
                                </TableCell>
                                <TableCell className="font-bold">Ksh {group.totalDue.toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" variant="destructive" onClick={() => onGenerateInvoice(group)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Generate Invoice
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )})}
                        {arrears.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No units in arrears for the selected period.
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
}
