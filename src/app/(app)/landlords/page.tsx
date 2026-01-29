
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getLandlords, getProperties, addOrUpdateLandlord, getTenants, getAllPayments } from '@/lib/data';
import type { Landlord, Property, Unit, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { LandlordCsvUploader } from '@/components/landlord-csv-uploader';
import { Building2, PlusCircle, Edit, ExternalLink, Search, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManageLandlordDialog } from '@/components/manage-landlord-dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { aggregateFinancials, calculateTransactionBreakdown } from '@/lib/financial-utils';
import { useLoading } from '@/hooks/useLoading';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { isWithinInterval } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { PaginationControls } from '@/components/ui/pagination-controls';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null);
  const { toast } = useToast();
  const { startLoading, stopLoading, isLoading } = useLoading();
  
  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [landlordForStatement, setLandlordForStatement] = useState<Landlord | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(2);

  const fetchData = () => {
    startLoading('Loading property data...');
    Promise.all([
      getLandlords(),
      getProperties(),
      getTenants(),
      getAllPayments()
    ]).then(([landlordData, propertyData, tenantData, paymentData]) => {
      setLandlords([SOIL_MERCHANTS_LANDLORD, ...landlordData]);
      setProperties(propertyData);
      setTenants(tenantData);
      setPayments(paymentData);
    }).catch(err => {
      console.error("Failed to fetch data:", err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load required data.' });
    }).finally(() => stopLoading());
  }

  useEffect(() => {
    fetchData();
  }, []);

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
           else if (u.ownership === 'Landlord' && !u.landlordId) {
            unassigned.push({ ...u, propertyName: p.name, propertyId: p.id });
          }
        });
      }
    });
    return { landlordUnitsMap: map, unassignedLandlordUnits: unassigned };
  }, [properties]);

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

  const handleGenerateStatement = async (landlord: Landlord, startDate: Date, endDate: Date) => {
    startLoading('Generating Statement...');
    try {
      const { generateLandlordStatementPDF } = await import('@/lib/pdf-generator');
      const landlordProperties: { property: Property; units: Unit[] }[] = [];
      if (landlord.id === SOIL_MERCHANTS_LANDLORD.id) {
        properties.forEach(p => {
          const units = p.units.filter(u => u.ownership === 'SM');
          if (units.length > 0) {
            landlordProperties.push({ property: p, units });
          }
        });
      } else {
        properties.forEach(p => {
          const units = p.units.filter(u => u.landlordId === landlord.id);
          if (units.length > 0) {
            landlordProperties.push({ property: p, units });
          }
        });
      }

      const ownedUnitIdentifiers = new Set<string>();
      landlordProperties.forEach(p => {
        p.units.forEach(u => ownedUnitIdentifiers.add(`${p.property.id}-${u.name}`));
      });

      const relevantTenants = tenants.filter(t => ownedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
      const relevantTenantIds = relevantTenants.map(t => t.id);
      
      const relevantPayments = payments.filter(p => 
          relevantTenantIds.includes(p.tenantId) && 
          p.type === 'Rent' &&
          isWithinInterval(new Date(p.date), { start: startDate, end: endDate })
      );

      const summary = aggregateFinancials(relevantPayments, relevantTenants, landlordProperties);
      
      const unitMap = new Map<string, Unit>();
        landlordProperties.forEach(p => {
            p.units.forEach(u => {
                unitMap.set(`${p.property.id}-${u.name}`, u);
            });
        });

      const transactionsForPDF = relevantPayments.map(payment => {
        const tenant = relevantTenants.find(t => t.id === payment.tenantId);
        const unit = tenant ? unitMap.get(`${tenant.propertyId}-${tenant.unitName}`) : undefined;
        const unitRent = unit?.rentAmount || tenant?.lease?.rent || 0;
        const serviceCharge = unit?.serviceCharge || tenant?.lease?.serviceCharge || 0;
        const breakdown = calculateTransactionBreakdown(payment.amount, unitRent, serviceCharge);
        return {
          date: new Date(payment.date).toLocaleDateString(),
          unit: tenant?.unitName || 'N/A',
          rentForMonth: payment.rentForMonth,
          gross: breakdown.gross,
          serviceCharge: breakdown.serviceChargeDeduction,
          mgmtFee: breakdown.managementFee,
          net: breakdown.netToLandlord,
        };
      });

      const unitsForPDF = landlordProperties.flatMap(p => p.units.map(u => ({
        property: p.property.name,
        unitName: u.name,
        unitType: u.unitType,
        status: u.status
      })));
      
      generateLandlordStatementPDF(landlord, summary, transactionsForPDF, unitsForPDF, startDate, endDate);
      setIsStatementDialogOpen(false); 

    } catch (error) {
      console.error("Error generating statement:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not generate PDF statement.' });
    } finally {
      stopLoading();
    }
  };
  
  const filteredLandlords = landlords.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const totalPages = Math.ceil(filteredLandlords.length / pageSize);
  const paginatedLandlords = filteredLandlords.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Landlords</h2>
          <p className="text-muted-foreground">Manage landlords and their assigned units.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search landlords..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button onClick={() => handleOpenDialog(null)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Landlord
          </Button>
          <LandlordCsvUploader onUploadComplete={fetchData} />
        </div>
      </div>

      {unassignedLandlordUnits.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-amber-700">Unassigned Landlord Units</CardTitle>
            <CardDescription className="text-amber-600">
              These units are owned by landlords but are not yet assigned to a landlord profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {unassignedLandlordUnits.map((unit, index) => (
                <div key={index} className="px-3 py-1 text-xs font-semibold rounded-full bg-white border shadow-sm">
                  {unit.propertyName}: Unit {unit.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && landlords.length === 0 ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {paginatedLandlords.map((landlord) => {
              const assignedUnits = landlordUnitsMap.get(landlord.id) || [];
              return (
                <Card key={landlord.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{landlord.name}</CardTitle>
                        <CardDescription>{landlord.email}</CardDescription>
                        <CardDescription>{landlord.phone}</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(landlord)}>
                        <Edit className="h-4 w-4 mr-2" /> Edit
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    {assignedUnits.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-4 border-t">
                        {assignedUnits.map((unit, index) => (
                          <Badge variant="secondary" key={index} className="font-normal">
                            {unit.propertyName}: Unit {unit.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4 border-t">No units assigned yet.</p>
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
          </div>
          {totalPages > 1 && (
            <div className="mt-6">
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredLandlords.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
            </div>
          )}
        </>
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
        landlord={landlordForStatement}
        onGenerate={handleGenerateStatement}
        isGenerating={isLoading}
      />
    </div>
  );
}
