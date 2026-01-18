
'use client';

import { useEffect, useState } from 'react';
import { getProperties, getLandlords, updateLandlord, getPropertyOwners, updatePropertyOwner } from '@/lib/data';
import type { Property, Landlord, PropertyOwner } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Edit, UserCog, Users, PlusCircle } from 'lucide-react';
import { ManageLandlordDialog } from '@/components/manage-landlord-dialog';
import { ManagePropertyOwnerDialog } from '@/components/manage-property-owner-dialog';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ClientsPage() {
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [propertyOwners, setPropertyOwners] = useState<PropertyOwner[]>([]);

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<PropertyOwner | null>(null);

  const [isLandlordDialogOpen, setIsLandlordDialogOpen] = useState(false);
  const [isOwnerDialogOpen, setIsOwnerDialogOpen] = useState(false);

  const { toast } = useToast();

  const fetchData = async () => {
    const props = await getProperties();
    const lords = await getLandlords();
    const owners = await getPropertyOwners();

    setAllProperties(props);
    setLandlords(lords);
    setPropertyOwners(owners);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const landlordProperties = allProperties.filter(p => p.units?.some(u => u.ownership === 'Landlord'));
  const clientProperties = allProperties.filter(p => p.units?.some(u => u.ownership === 'Client'));

  const handleManageLandlordClick = (property: Property) => {
    setSelectedProperty(property);
    const landlordId = `landlord-for-${property.id}-${Date.now()}`;
    const newLandlord: Landlord = { id: landlordId, name: '', email: '', phone: '', bankAccount: '' };
    setSelectedLandlord(newLandlord);
    setIsLandlordDialogOpen(true);
  };

  const handleManageOwnerClick = (property: Property) => {
    setSelectedProperty(property);
    const existingOwner = propertyOwners.find(o => o.assignedUnits.some(au => au.propertyId === property.id));
    setSelectedOwner(existingOwner || null);
    setIsOwnerDialogOpen(true);
  };

  const handleSaveLandlord = async (landlordData: Landlord, selectedUnitNames: string[]) => {
    if (!selectedProperty) return;
    try {
      await updateLandlord(landlordData.id, landlordData, selectedProperty.id, selectedUnitNames);
      toast({ title: 'Landlord Saved', description: `Details for ${landlordData.name} have been saved.` });
      fetchData();
      setIsLandlordDialogOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save landlord.' });
    }
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clients & Owners</h2>
          <p className="text-muted-foreground">Manage landlord and property owner relationships.</p>
        </div>
      </div>

      <Tabs defaultValue="landlords" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="landlords" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Landlords
          </TabsTrigger>
          <TabsTrigger value="owners" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Property Owners (Clients)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="landlords" className="space-y-6">
          {landlordProperties.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {landlordProperties.map(property => (
                <Card key={property.id} className="h-full flex flex-col group hover:shadow-lg transition-all duration-300 border-primary/10">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{property.name}</CardTitle>
                        <CardDescription>{property.address}</CardDescription>
                      </div>
                      <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Building2 className="h-6 w-6" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <div className="flex justify-between items-center text-sm font-medium">
                      <span className="text-muted-foreground">{property.type}</span>
                      <span className="bg-primary/5 text-primary px-2 py-1 rounded-md">
                        {property.units.filter(u => u.ownership === 'Landlord').length} Landlord Units
                      </span>
                    </div>
                  </CardContent>
                  <div className="p-6 pt-0">
                    <Button onClick={() => handleManageLandlordClick(property)} className="w-full">
                      <Edit className="mr-2 h-4 w-4" />
                      Manage Landlords
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState message="No properties with landlord-owned units found." />
          )}
        </TabsContent>

        <TabsContent value="owners" className="space-y-6">
          {clientProperties.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {clientProperties.map(property => {
                const ownersForProperty = propertyOwners.filter(o => o.assignedUnits && o.assignedUnits.some(au => au.propertyId === property.id));
                const assignedUnitNamesForProperty = new Set(
                    ownersForProperty.flatMap(o => o.assignedUnits.find(au => au.propertyId === property.id)?.unitNames || [])
                );
                const unassignedUnits = property.units.filter(u => u.ownership === 'Client' && !assignedUnitNamesForProperty.has(u.name));

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
                          {property.units.filter(u => u.ownership === 'Client').length} total client units
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
            <EmptyState message="No properties with client-owned units found." />
          )}
        </TabsContent>
      </Tabs>

      {selectedProperty && selectedLandlord && (
        <ManageLandlordDialog
          isOpen={isLandlordDialogOpen}
          onClose={() => setIsLandlordDialogOpen(false)}
          landlord={selectedLandlord}
          property={selectedProperty}
          onSave={handleSaveLandlord}
        />
      )}

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
