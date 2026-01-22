
'use client';

import { useEffect, useState } from 'react';
import { getProperties, getPropertyOwners, updatePropertyOwner, getTenants, getAllPayments } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, UserCog, PlusCircle, FileSignature } from 'lucide-react';
import { ManagePropertyOwnerDialog } from '@/components/manage-property-owner-dialog';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/hooks/useLoading';
import { generateOwnerServiceChargeStatementPDF } from '@/lib/pdf-generator';

export default function ClientsPage() {
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<PropertyOwner | null>(null);
  const [isOwnerDialogOpen, setIsOwnerDialogOpen] = useState(false);
  const { toast } = useToast();
  const { startLoading, stopLoading } = useLoading();

  const fetchData = async () => {
    const [props, owners, tenants, payments] = await Promise.all([
      getProperties(),
      getPropertyOwners(),
      getTenants(),
      getAllPayments()
    ]);
    setAllProperties(props);
    setPropertyOwners(owners);
    setAllTenants(tenants);
    setAllPayments(payments);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const isClientManagedUnit = (u: Unit) =>
    u.status === 'client occupied' &&
    u.ownership === 'Landlord' &&
    u.managementStatus === 'Client Self Fully Managed' &&
    u.handoverStatus === 'Handed Over';

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

  const handleGenerateStatement = (ownerId: string) => {
    startLoading('Generating Statement...');
    try {
        const owner = propertyOwners.find(o => o.id === ownerId);
        if (!owner) {
            throw new Error("Owner not found");
        }

        const ownerAssignedUnitIdentifiers = new Set(
            owner.assignedUnits.flatMap(au => au.unitNames.map(un => `${au.propertyId}-${un}`))
        );

        const relevantTenants = allTenants.filter(t => 
            ownerAssignedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`)
        );
        const relevantTenantIds = relevantTenants.map(t => t.id);

        const serviceChargePayments = allPayments.filter(p =>
            relevantTenantIds.includes(p.tenantId) && p.type === 'ServiceCharge'
        );

        const paymentsForPDF = serviceChargePayments.map(p => {
            const tenant = allTenants.find(t => t.id === p.tenantId);
            const property = allProperties.find(prop => prop.id === tenant?.propertyId);
            return {
                date: p.date,
                property: property?.name || 'N/A',
                unit: tenant?.unitName || 'N/A',
                amount: p.amount
            };
        });

        generateOwnerServiceChargeStatementPDF(owner, paymentsForPDF);
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
          <h2 className="text-3xl font-bold tracking-tight">Property Owners (Clients)</h2>
          <p className="text-muted-foreground">Manage property owner contact information and unit assignments.</p>
        </div>
      </div>

      <div className="space-y-6">
          {clientProperties.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {clientProperties.map(property => {
                const ownersForProperty = propertyOwners.filter(o => o.assignedUnits && o.assignedUnits.some(au => au.propertyId === property.id));
                const assignedUnitNamesForProperty = new Set(
                    ownersForProperty.flatMap(o => o.assignedUnits.find(au => au.propertyId === property.id)?.unitNames || [])
                );
                const unassignedUnits = property.units.filter(u => isClientManagedUnit(u) && !assignedUnitNamesForProperty.has(u.name));

                return (
                  <Card key={property.id} className="h-full flex flex-col group hover:shadow-lg transition-all duration-300 border-amber-500/10">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-xl">{property.name}</CardTitle>
                          <CardDescription>{property.address}</CardDescription>
                        </div>
                        <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-colors shrink-0">
                          <UserCog className="h-6 w-6" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-6 pt-0">
                      <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                        <span>Property Owners</span>
                        <span className="bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full lowercase font-medium">
                          {property.units.filter(isClientManagedUnit).length} total client units
                        </span>
                      </div>

                      <div className="space-y-4">
                        {ownersForProperty.length > 0 ? (
                          ownersForProperty.map(owner => (
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
                                      onClick={() => handleGenerateStatement(owner.id)}
                                  >
                                      <FileSignature className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 hover:bg-amber-500 hover:text-white transition-colors"
                                    onClick={() => {
                                      setSelectedProperty(property);
                                      setSelectedOwner(owner);
                                      setIsOwnerDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {owner.assignedUnits?.find(au => au.propertyId === property.id)?.unitNames.map(unitName => (
                                  <span key={unitName} className="px-2 py-0.5 rounded bg-white border text-[10px] font-bold shadow-sm">
                                    Unit {unitName}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 bg-muted/20 rounded-xl border-dashed border-2">
                            <p className="text-xs text-muted-foreground italic">No owners registered yet.</p>
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
                                setSelectedProperty(property);
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
                );
              })}
            </div>
          ) : (
            <EmptyState message="No properties with client-managed units found." />
          )}
      </div>

      {selectedProperty && (
        <ManagePropertyOwnerDialog
          isOpen={isOwnerDialogOpen}
          onClose={() => setIsOwnerDialogOpen(false)}
          owner={selectedOwner}
          property={selectedProperty}
          onSave={handleSaveOwner}
        />
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 border-dashed border-2 rounded-lg bg-muted/20">
      <h3 className="text-xl font-semibold">Ready to Manage</h3>
      <p className="text-muted-foreground mt-2">{message}</p>
    </div>
  );
}
