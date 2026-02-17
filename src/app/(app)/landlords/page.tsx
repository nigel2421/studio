
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getLandlords, getProperties, addOrUpdateLandlord, getTenants, getAllPaymentsForReport, deleteLandlord } from '@/lib/data';
import type { Landlord, Property, Unit, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { LandlordCsvUploader } from '@/components/landlord-csv-uploader';
import { Building, Building2, PlusCircle, Edit, ExternalLink, Search, FileDown, Loader2, Users2, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManageLandlordDialog } from '@/components/manage-landlord-dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { aggregateFinancials, generateLandlordDisplayTransactions } from '@/lib/financial-utils';
import { useLoading } from '@/hooks/useLoading';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { isWithinInterval } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog';
import { useAuth } from '@/hooks/useAuth';

const SOIL_MERCHANTS_LANDLORD: Landlord = {
  id: 'soil_merchants_internal',
  name: 'Soil Merchants',
  email: 'internal@eracov.com',
  phone: 'N/A',
  bankAccount: 'Internal Account',
};


export default function LandlordsPage() {
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null);
  const { toast } = useToast();
  const { startLoading, stopLoading, isLoading } = useLoading();
  
  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [landlordForStatement, setLandlordForStatement] = useState<Landlord | null>(null);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [landlordToDelete, setLandlordToDelete] = useState<Landlord | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // New state for pagination and unassigned units view
  const [showAllUnassigned, setShowAllUnassigned] = useState(false);
  const [landlordCurrentPage, setLandlordCurrentPage] = useState(1);
  const [landlordPageSize, setLandlordPageSize] = useState(6);
  const { userProfile } = useAuth();
  const isInvestmentConsultant = userProfile?.role === 'investment-consultant';

  const fetchData = useCallback(() => {
    startLoading('Loading property data...');
    Promise.all([
      getLandlords(),
      getProperties(),
      getTenants(),
      getAllPaymentsForReport()
    ]).then(([landlordData, propertyData, tenantData, paymentData]) => {
      setLandlords([SOIL_MERCHANTS_LANDLORD, ...landlordData]);
      setProperties(propertyData);
      setTenants(tenantData);
      setPayments(paymentData);
    }).catch(err => {
      console.error("Failed to fetch data:", err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load required data.' });
    }).finally(() => stopLoading());
  }, [startLoading, stopLoading, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset pagination when property or search query changes
  useEffect(() => {
    setLandlordCurrentPage(1);
  }, [selectedPropertyId, searchQuery]);

  const investorLandlordIds = useMemo(() => {
    const ids = new Set<string>();
    properties.forEach(p => {
        p.units.forEach(u => {
            if(u.landlordId && u.ownership === 'Landlord' && (u.managementStatus === 'Rented for Clients' || u.managementStatus === 'Rented for Soil Merchants' || u.managementStatus === 'Airbnb')) {
                ids.add(u.landlordId);
            }
        });
    });
    return ids;
  }, [properties]);

  const landlordManagedProperties = useMemo(() => {
    const propertyIds = new Set<string>();
    properties.forEach(p => {
      if (p.units.some(u => u.ownership === 'SM' || u.managementStatus === 'Rented for Clients' || u.managementStatus === 'Airbnb')) {
        propertyIds.add(p.id);
      }
    });
    return properties.filter(p => propertyIds.has(p.id));
  }, [properties]);
  
  const selectedProperty = useMemo(() => {
    return properties.find(p => p.id === selectedPropertyId) || null;
  }, [selectedPropertyId, properties]);

  const { landlordUnitsMap, unassignedLandlordUnits } = useMemo(() => {
    const map = new Map<string, (Unit & { propertyName: string; propertyId: string })[]>();
    const unassigned: (Unit & { propertyName: string; propertyId: string })[] = [];

    if (!properties || properties.length === 0) return { landlordUnitsMap: map, unassignedLandlordUnits: unassigned };

    properties.forEach(p => {
      if (p.units) {
        p.units.forEach(u => {
          if (u.ownership === 'Landlord' && u.landlordId) {
            if (!map.has(u.landlordId)) {
              map.set(u.landlordId, []);
            }
            map.get(u.landlordId)!.push({ ...u, propertyName: p.name, propertyId: p.id });
          } else if (u.ownership === 'SM') {
            if (!map.has(SOIL_MERCHANTS_LANDLORD.id)) {
              map.set(SOIL_MERCHANTS_LANDLORD.id, []);
            }
            map.get(SOIL_MERCHANTS_LANDLORD.id)!.push({ ...u, propertyName: p.name, propertyId: p.id });
          }
           else if (u.ownership === 'Landlord' && !u.landlordId && u.managementStatus !== 'Client Managed') {
            unassigned.push({ ...u, propertyName: p.name, propertyId: p.id });
          }
        });
      }
    });
    
    return { landlordUnitsMap: map, unassignedLandlordUnits: unassigned };
  }, [properties]);
  
  const investorLandlords = useMemo(() => {
      return landlords.filter(l => investorLandlordIds.has(l.id) || l.id === SOIL_MERCHANTS_LANDLORD.id);
  }, [landlords, investorLandlordIds]);

  const landlordsForSelectedProperty = useMemo(() => {
    if (!selectedPropertyId) return [];

    const landlordIdsInProperty = new Set<string>();
    const property = properties.find(p => p.id === selectedPropertyId);
    if (property) {
      property.units.forEach(unit => {
        if (unit.landlordId && investorLandlordIds.has(unit.landlordId)) {
          landlordIdsInProperty.add(unit.landlordId);
        }
        if (unit.ownership === 'SM') {
            landlordIdsInProperty.add(SOIL_MERCHANTS_LANDLORD.id);
        }
      });
    }
    
    return investorLandlords.filter(l => landlordIdsInProperty.has(l.id));
  }, [selectedPropertyId, properties, investorLandlords, investorLandlordIds]);
  
  const filteredLandlords = useMemo(() => {
    if (!searchQuery) {
      return landlordsForSelectedProperty;
    }
    const lowercasedQuery = searchQuery.toLowerCase();
    return landlordsForSelectedProperty.filter(landlord => 
      landlord.name.toLowerCase().includes(lowercasedQuery) ||
      landlord.email.toLowerCase().includes(lowercasedQuery)
    );
  }, [landlordsForSelectedProperty, searchQuery]);


  const totalInvestorLandlords = useMemo(() => {
    return landlords.filter(l => l.id !== SOIL_MERCHANTS_LANDLORD.id).length;
  }, [landlords]);

  const totalManagedUnits = useMemo(() => {
    let count = 0;
    properties.forEach(p => {
        count += p.units.filter(u => u.ownership === 'SM' || u.managementStatus === 'Rented for Clients' || u.managementStatus === 'Airbnb').length;
    });
    return count;
  }, [properties]);
  
  const unassignedUnitsForSelectedProperty = useMemo(() => {
      if (!selectedPropertyId) return [];
      return unassignedLandlordUnits.filter(u => u.propertyId === selectedPropertyId);
  }, [unassignedLandlordUnits, selectedPropertyId]);

  const paginatedLandlords = useMemo(() => {
    const start = (landlordCurrentPage - 1) * landlordPageSize;
    return filteredLandlords.slice(start, start + landlordPageSize);
  }, [filteredLandlords, landlordCurrentPage, landlordPageSize]);

  const landlordTotalPages = Math.ceil(filteredLandlords.length / landlordPageSize);

  const unassignedUnitsToShow = useMemo(() => {
      const PREVIEW_COUNT = 14;
      if (showAllUnassigned || unassignedUnitsForSelectedProperty.length <= PREVIEW_COUNT) {
          return unassignedUnitsForSelectedProperty;
      }
      return unassignedUnitsForSelectedProperty.slice(0, PREVIEW_COUNT);
  }, [unassignedUnitsForSelectedProperty, showAllUnassigned]);


  const handleOpenDialog = (landlord: Landlord | null) => {
    if (landlord?.id === SOIL_MERCHANTS_LANDLORD.id) {
      toast({
        variant: 'destructive',
        title: 'Cannot Edit',
        description: 'Soil Merchants is an internal profile and cannot be edited.'
      });
      return;
    }
    setSelectedLandlord(landlord);
    setIsManageDialogOpen(true);
  };

  const handleSaveLandlord = async (landlordData: Landlord, assignedUnitNames: string[]) => {
    try {
      await addOrUpdateLandlord(landlordData, assignedUnitNames);
      toast({
        title: landlordData.id ? 'Landlord Updated' : 'Landlord Added',
        description: `Details for ${landlordData.name} have been saved.`,
      });
      fetchData();
      setIsManageDialogOpen(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e.message || 'Failed to save landlord details.',
      });
    }
  };

  const handleDeleteLandlord = async () => {
    if (!landlordToDelete) return;
    startLoading(`Deleting ${landlordToDelete.name}...`);
    try {
      await deleteLandlord(landlordToDelete.id);
      toast({ title: 'Landlord Deleted', description: `${landlordToDelete.name} has been removed.` });
      fetchData();
      setIsDeleteDialogOpen(false);
      setLandlordToDelete(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete landlord.' });
    } finally {
      stopLoading();
    }
  }

  const handleGenerateStatement = async (landlord: Landlord, startDate: Date, endDate: Date) => {
    startLoading('Generating Statement...');
    try {
        const { generateLandlordStatementPDF } = await import('@/lib/pdf-generator');

        const landlordUnitIdentifiers = new Set<string>();
        const landlordPropertyIds = new Set<string>();

        properties.forEach(p => {
            (p.units || []).forEach(u => {
                const isSoilMerchantsUnit = landlord.id === SOIL_MERCHANTS_LANDLORD.id && u.ownership === 'SM';
                const isLandlordUnit = u.landlordId === landlord.id;

                if (isSoilMerchantsUnit || isLandlordUnit) {
                    landlordUnitIdentifiers.add(`${p.id}-${u.name}`);
                    landlordPropertyIds.add(p.id);
                }
            });
        });
        
        const relevantProperties = properties.filter(p => landlordPropertyIds.has(p.id));
        const relevantTenants = tenants.filter(t => landlordUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
        const relevantTenantIds = relevantTenants.map(t => t.id);
        const allRelevantPayments = payments.filter(p => relevantTenantIds.includes(p.tenantId));

        const summary = aggregateFinancials(allRelevantPayments, relevantTenants, relevantProperties, startDate, endDate, landlord.id);
        const displayTransactions = generateLandlordDisplayTransactions(allRelevantPayments, relevantTenants, relevantProperties, startDate, endDate);
        
        const transactionsForPDF = displayTransactions.map(t => ({
            date: new Date(t.date).toLocaleDateString(),
            unit: t.unitName,
            rentForMonth: t.forMonth,
            gross: t.gross,
            serviceCharge: t.serviceChargeDeduction,
            mgmtFee: t.managementFee,
            otherCosts: t.otherCosts || 0,
            net: t.netToLandlord,
        }));
        
        const unitsForPDF = relevantProperties.flatMap(p => 
            (p.units || []).filter(u => {
                const isSoilMerchantsUnit = landlord.id === SOIL_MERCHANTS_LANDLORD.id && u.ownership === 'SM';
                const isLandlordUnit = u.landlordId === landlord.id;
                return isSoilMerchantsUnit || isLandlordUnit;
            }).map(u => ({
                property: p.name,
                unitName: u.name,
                unitType: u.unitType,
                status: u.status,
            }))
        );
        
        generateLandlordStatementPDF(landlord, summary, transactionsForPDF, unitsForPDF, startDate, endDate);
        setIsStatementDialogOpen(false); 

    } catch (error) {
        console.error("Error generating statement:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not generate PDF statement.' });
    } finally {
        stopLoading();
    }
};
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Landlords (Investors)</h2>
          <p className="text-muted-foreground">Manage landlords whose units are managed by Eracov.</p>
        </div>
        <div className="flex items-center gap-2">
            {!isInvestmentConsultant && (
                <>
                    <Button onClick={() => handleOpenDialog(null)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Landlord
                    </Button>
                    <LandlordCsvUploader onUploadComplete={fetchData} />
                </>
            )}
        </div>
      </div>

       <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Investor Landlords</CardTitle>
            <Users2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInvestorLandlords}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Managed Units</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalManagedUnits}</div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
            <CardTitle>Select Property</CardTitle>
            <CardDescription>Choose a property to view its associated landlords and unassigned units.</CardDescription>
        </CardHeader>
        <CardContent>
            <Select onValueChange={setSelectedPropertyId} value={selectedPropertyId || ''}>
                <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="Select a property..." />
                </SelectTrigger>
                <SelectContent>
                    {landlordManagedProperties.map(property => (
                        <SelectItem key={property.id} value={property.id}>
                            {property.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </CardContent>
      </Card>
      
      {selectedPropertyId ? (
        <>
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {unassignedUnitsForSelectedProperty.length > 0 && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="text-amber-700">Unassigned Landlord Units</CardTitle>
                    <CardDescription className="text-amber-600">
                      These units in {selectedProperty?.name} are not yet assigned to a landlord profile.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2">
                      {unassignedUnitsToShow.map((unit, index) => (
                        <div key={index} className="px-3 py-1 text-xs font-semibold rounded-full bg-white border shadow-sm">
                          Unit {unit.name}
                        </div>
                      ))}
                       {unassignedUnitsForSelectedProperty.length > unassignedUnitsToShow.length && (
                          <Button variant="link" className="text-amber-700 h-auto p-1 text-xs" onClick={() => setShowAllUnassigned(true)}>
                              ...and {unassignedUnitsForSelectedProperty.length - unassignedUnitsToShow.length} more
                          </Button>
                       )}
                       {showAllUnassigned && unassignedUnitsForSelectedProperty.length > 14 && (
                           <Button variant="link" className="text-amber-700 h-auto p-1 text-xs" onClick={() => setShowAllUnassigned(false)}>
                               Show Less
                           </Button>
                       )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search landlords by name or email..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {paginatedLandlords.map((landlord) => {
                    const assignedUnits = (landlordUnitsMap.get(landlord.id) || []).filter(u => u.propertyId === selectedPropertyId);
                    const unitsToShow = assignedUnits.slice(0, 9);
                    const hiddenUnitCount = assignedUnits.length - unitsToShow.length;

                    return (
                      <Card key={landlord.id} className="flex flex-col">
                        <CardHeader>
                           <div className="flex justify-between items-start">
                            <div>
                              <CardTitle>{landlord.name}</CardTitle>
                              <CardDescription>{landlord.email}</CardDescription>
                              <CardDescription>{landlord.phone}</CardDescription>
                            </div>
                            <div className="flex items-center">
                                {!isInvestmentConsultant && (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(landlord)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => {
                                            if (landlord.id === SOIL_MERCHANTS_LANDLORD.id) {
                                                toast({ variant: 'destructive', title: 'Action Not Allowed', description: 'The internal Soil Merchants profile cannot be deleted.' });
                                                return;
                                            }
                                            setLandlordToDelete(landlord);
                                            setIsDeleteDialogOpen(true);
                                        }}>
                                            <Trash className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-grow">
                          {assignedUnits.length > 0 ? (
                            <div className="flex flex-wrap gap-2 pt-4 border-t">
                              {unitsToShow.map((unit, index) => (
                                <Badge variant="secondary" key={index} className="font-normal">
                                  Unit {unit.name}
                                </Badge>
                              ))}
                              {hiddenUnitCount > 0 && (
                                  <Badge variant="outline">
                                      +{hiddenUnitCount} more
                                  </Badge>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4 border-t">No units assigned in this property.</p>
                          )}
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" variant="outline" onClick={() => { setLandlordForStatement(landlord); setIsStatementDialogOpen(true); }}>
                                <FileDown className="mr-2 h-4 w-4" />
                                Generate Statement
                            </Button>
                        </CardFooter>
                      </Card>
                    )
                  })}
                  {filteredLandlords.length === 0 && !isLoading && (
                      <div className="md:col-span-3 text-center py-10">
                          <p className="text-muted-foreground">No landlords found matching your search.</p>
                      </div>
                  )}
                </div>

                {landlordTotalPages > 1 && (
                  <PaginationControls
                    currentPage={landlordCurrentPage}
                    totalPages={landlordTotalPages}
                    pageSize={landlordPageSize}
                    totalItems={filteredLandlords.length}
                    onPageChange={setLandlordCurrentPage}
                    onPageSizeChange={setLandlordPageSize}
                  />
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 border-dashed border-2 rounded-lg bg-muted/20">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No Property Selected</h3>
          <p className="mt-2 text-sm text-muted-foreground">Please select a property from the dropdown above to view its details.</p>
        </div>
      )}

      {isManageDialogOpen && (
        <ManageLandlordDialog
          isOpen={isManageDialogOpen}
          onClose={() => setIsManageDialogOpen(false)}
          landlord={selectedLandlord}
          allLandlords={landlords}
          properties={properties}
          onSave={handleSaveLandlord}
        />
      )}
      
      <StatementOptionsDialog
        isOpen={isStatementDialogOpen}
        onClose={() => setIsStatementDialogOpen(false)}
        entity={landlordForStatement}
        onGenerate={(entity, start, end) => handleGenerateStatement(entity as Landlord, start, end)}
        isGenerating={isLoading}
      />
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteLandlord}
        isLoading={isLoading}
        itemName={landlordToDelete?.name || ''}
        itemType="landlord"
      />
    </div>
  );
}

    
