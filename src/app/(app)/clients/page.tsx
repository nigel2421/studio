
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getProperties, getPropertyOwners, updatePropertyOwner, getTenants, getAllPayments, getLandlords } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment, Landlord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, UserCog, PlusCircle, FileSignature, Building2, Users } from 'lucide-react';
import { ManagePropertyOwnerDialog } from '@/components/manage-property-owner-dialog';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/hooks/useLoading';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ClientsPage() {
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [allLandlords, setAllLandlords] = useState<Landlord[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  
  const [selectedOwner, setSelectedOwner] = useState<PropertyOwner | null>(null);
  const [isOwnerDialogOpen, setIsOwnerDialogOpen] = useState(false);
  const { toast } = useToast();
  const { startLoading, stopLoading, isLoading } = useLoading();

  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [ownerForStatement, setOwnerForStatement] = useState<PropertyOwner | null>(null);

  const fetchData = async () => {
    const [props, owners, tenants, payments, landlords] = await Promise.all([
      getProperties(),
      getPropertyOwners(),
      getTenants(),
      getAllPayments(),
      getLandlords(),
    ]);
    setAllProperties(props);
    setPropertyOwners(owners);
    setAllTenants(tenants);
    setAllPayments(payments);
    setAllLandlords(landlords);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const allUnitsMap = useMemo(() => {
    const map = new Map<string, Unit>();
    allProperties.forEach(p => {
      p.units.forEach(u => {
        map.set(`${p.id}-${u.name}`, u);
      });
    });
    return map;
  }, [allProperties]);

  const unifiedClientOwners = useMemo(() => {
    const clientOnlyPropertyOwners = propertyOwners.filter(owner => {
        if (!owner.assignedUnits || owner.assignedUnits.length === 0) return false;
        return !owner.assignedUnits.some(assignedProp => 
            assignedProp.unitNames.some(unitName => {
                const unit = allUnitsMap.get(`${assignedProp.propertyId}-${unitName}`);
                return unit && unit.managementStatus !== 'Client Managed';
            })
        );
    });

    const landlordUnitsMap = new Map<string, Unit[]>();
    allProperties.forEach(p => {
        if (p.units) {
            p.units.forEach(u => {
                if (u.landlordId) {
                    if (!landlordUnitsMap.has(u.landlordId)) {
                        landlordUnitsMap.set(u.landlordId, []);
                    }
                    landlordUnitsMap.get(u.landlordId)!.push({ ...u, propertyId: p.id });
                }
            });
        }
    });

    const clientLandlords = allLandlords.filter(landlord => {
        const units = landlordUnitsMap.get(landlord.id);
        if (!units || units.length === 0) return false;
        return units.every(u => u.managementStatus === 'Client Managed');
    });

    const formattedClientLandlords: PropertyOwner[] = clientLandlords.map(landlord => {
        const units = landlordUnitsMap.get(landlord.id) || [];
        const assignedUnits = units.reduce((acc, unit) => {
            if (!unit.propertyId) return acc;
            let prop = acc.find(p => p.propertyId === unit.propertyId);
            if (!prop) {
                prop = { propertyId: unit.propertyId, unitNames: [] };
                acc.push(prop);
            }
            prop.unitNames.push(unit.name);
            return acc;
        }, [] as { propertyId: string, unitNames: string[] }[]);

        return {
            id: landlord.id,
            name: landlord.name,
            email: landlord.email,
            phone: landlord.phone,
            bankAccount: landlord.bankAccount,
            userId: landlord.userId,
            assignedUnits,
        };
    });

    return [...clientOnlyPropertyOwners, ...formattedClientLandlords];
  }, [propertyOwners, allLandlords, allProperties, allUnitsMap]);
  
  const clientProperties = useMemo(() => {
      const propertyIdsWithClients = new Set<string>();
      unifiedClientOwners.forEach(owner => {
          if (owner.assignedUnits) {
              owner.assignedUnits.forEach(au => propertyIdsWithClients.add(au.propertyId));
          }
      });

      allProperties.forEach(p => {
          if (p.units.some(u => u.managementStatus === 'Client Managed')) {
               propertyIdsWithClients.add(p.id);
          }
      });

      return allProperties.filter(p => propertyIdsWithClients.has(p.id) && p.units.some(u => u.managementStatus === 'Client Managed'));
  }, [allProperties, unifiedClientOwners]);

  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return allProperties.find(p => p.id === selectedPropertyId);
  }, [selectedPropertyId, allProperties]);

  const ownersForSelectedProperty = useMemo(() => {
    if (!selectedPropertyId) return [];
    return unifiedClientOwners.filter(o => o.assignedUnits?.some(au => au.propertyId === selectedPropertyId));
  }, [selectedPropertyId, unifiedClientOwners]);

  const unassignedUnits = useMemo(() => {
    if (!selectedProperty) return [];
    const assignedUnitNamesForProperty = new Set(
        ownersForSelectedProperty.flatMap(o => o.assignedUnits?.find(au => au.propertyId === selectedProperty.id)?.unitNames || [])
    );
    return selectedProperty.units.filter(u => u.managementStatus === 'Client Managed' && !assignedUnitNamesForProperty.has(u.name));
  }, [selectedProperty, ownersForSelectedProperty]);

  const totalClientUnits = useMemo(() => {
    let count = 0;
    clientProperties.forEach(p => {
      count += p.units.filter(u => u.managementStatus === 'Client Managed').length;
    });
    return count;
  }, [clientProperties]);

  const handleSaveOwner = async (ownerData: PropertyOwner, selectedUnitNames: string[]) => {
    if (!selectedProperty) return;
    
    const updatedAssignedUnits = ownerData.assignedUnits?.filter(au => au.propertyId !== selectedProperty.id) || [];
    if (selectedUnitNames.length > 0) {
        updatedAssignedUnits.push({ propertyId: selectedProperty.id, unitNames: selectedUnitNames });
    }

    const dataToSave: PropertyOwner = {
        ...ownerData,
        assignedUnits: updatedAssignedUnits
    };

    try {
      await updatePropertyOwner(ownerData.id, dataToSave);
      toast({ title: 'Owner Saved', description: `Contact details for ${ownerData.name} have been saved.` });
      fetchData();
      setIsOwnerDialogOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save owner.' });
    }
  }

  const handleGenerateStatement = async (owner: PropertyOwner, startDate: Date, endDate: Date) => {
    startLoading('Generating Statement...');
    try {
        const { generateOwnerServiceChargeStatementPDF } = await import('@/lib/pdf-generator');
        if (!owner) {
            throw new Error("Owner not found");
        }
        
        generateOwnerServiceChargeStatementPDF(owner, allProperties, allTenants, allPayments, startDate, endDate);
        
        setIsStatementDialogOpen(false);
    } catch (error: any) {
        console.error("Error generating statement:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to generate statement.' });
    } finally {
        stopLoading();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client Self Managed Units</h2>
          <p className="text-muted-foreground">Manage contact information for owners who self-manage their units.</p>
        </div>
        <Button
            onClick={() => {
              setSelectedOwner(null);
              setIsOwnerDialogOpen(true);
            }}
            disabled={!selectedPropertyId}
        >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Owner
        </Button>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Client Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientProperties.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Client Units</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClientUnits}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Select Property</CardTitle>
            <CardDescription>Choose a property to view its owners and client-managed units.</CardDescription>
        </CardHeader>
        <CardContent>
            <Select onValueChange={setSelectedPropertyId} value={selectedPropertyId || ''}>
                <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="Select a property..." />
                </SelectTrigger>
                <SelectContent>
                    {clientProperties.map(property => (
                        <SelectItem key={property.id} value={property.id}>
                            {property.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </CardContent>
      </Card>
      
      {selectedProperty ? (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">{selectedProperty.name}</CardTitle>
            <CardDescription>{selectedProperty.address}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
              <span>Property Owners</span>
              <span className="bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full lowercase font-medium">
                {selectedProperty.units.filter(u => u.managementStatus === 'Client Managed').length} total client units
              </span>
            </div>
            
            <div className="space-y-4">
                {ownersForSelectedProperty.length > 0 ? (
                  ownersForSelectedProperty.map(owner => (
                    <div key={owner.id} className="p-4 rounded-xl border bg-muted/30 relative group/owner">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-sm">{owner.name}</p>
                          <p className="text-xs text-muted-foreground">{owner.email}</p>
                          <p className="text-xs text-muted-foreground">{owner.phone}</p>
                        </div>
                        <div className="flex items-center">
                           <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 hover:bg-green-500 hover:text-white transition-colors"
                              onClick={() => {
                                setOwnerForStatement(owner);
                                setIsStatementDialogOpen(true);
                              }}
                          >
                              <FileSignature className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 hover:bg-amber-500 hover:text-white transition-colors"
                            onClick={() => {
                              setSelectedOwner(owner);
                              setIsOwnerDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {owner.assignedUnits?.find(au => au.propertyId === selectedProperty?.id)?.unitNames.map(unitName => (
                          <span key={unitName} className="px-2 py-0.5 rounded bg-white border text-[10px] font-bold shadow-sm">
                            Unit {unitName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 bg-muted/20 rounded-xl border-dashed border-2">
                    <p className="text-xs text-muted-foreground italic">No owners registered for this property yet.</p>
                  </div>
                )}
            </div>
            
            {unassignedUnits.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] font-bold uppercase text-amber-600 tracking-widest flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-amber-500" />
                  Unassigned Units
                </h4>
                <div className="p-4 rounded-xl border-dashed border-2 border-amber-500/20 bg-amber-500/5">
                  <div className="flex gap-1.5 flex-wrap mb-4">
                    {unassignedUnits.map(u => (
                      <span key={u.name} className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[10px] font-bold">
                        {u.name}
                      </span>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500 hover:text-white h-8 text-xs font-semibold"
                    onClick={() => {
                      setSelectedOwner(null);
                      setIsOwnerDialogOpen(true);
                    }}
                  >
                    <PlusCircle className="mr-2 h-3 w-3" />
                    Assign New Owner
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-16 border-dashed border-2 rounded-lg bg-muted/20">
          <UserCog className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No Property Selected</h3>
          <p className="mt-2 text-sm text-muted-foreground">Please select a property from the dropdown above to view its details.</p>
        </div>
      )}

      {selectedProperty && (
        <ManagePropertyOwnerDialog
          isOpen={isOwnerDialogOpen}
          onClose={() => setIsOwnerDialogOpen(false)}
          owner={selectedOwner}
          property={selectedProperty}
          allOwners={propertyOwners}
          onSave={handleSaveOwner}
        />
      )}

      {ownerForStatement && (
        <StatementOptionsDialog
            isOpen={isStatementDialogOpen}
            onClose={() => setIsStatementDialogOpen(false)}
            landlord={ownerForStatement}
            onGenerate={handleGenerateStatement as any}
            isGenerating={isLoading}
        />
      )}
    </div>
  );
}
