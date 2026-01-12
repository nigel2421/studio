
'use client';

import { useEffect, useState } from 'react';
import { getProperties, getLandlord, updateLandlord } from '@/lib/data';
import type { Property, Landlord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Edit } from 'lucide-react';
import { ManageLandlordDialog } from '@/components/manage-landlord-dialog';

export default function ClientsPage() {
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [landlordProperties, setLandlordProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const props = await getProperties();
      setAllProperties(props);
      const filtered = props.filter(p => Array.isArray(p.units) && p.units.some(u => u.ownership === 'Landlord'));
      setLandlordProperties(filtered);
    }
    fetchData();
  }, []);

  const handleManageClick = async (property: Property) => {
    setSelectedProperty(property);
    // This assumes a landlord is associated with a property, for simplicity.
    // In a real app, you might have a more complex mapping.
    // We'll use the property ID as a stand-in for the landlord ID.
    const landlordId = property.id;
    const landlordData = await getLandlord(landlordId);
    setLandlord(landlordData ?? { id: landlordId, name: '', bankAccount: '', earnings: 0 });
    setIsDialogOpen(true);
  };
  
  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedProperty(null);
    setLandlord(null);
  }
  
  const handleSaveLandlord = async (landlordData: Landlord) => {
    await updateLandlord(landlordData.id, landlordData);
    handleDialogClose();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client Properties</h2>
          <p className="text-muted-foreground">Manage properties owned by landlords.</p>
        </div>
      </div>

      {landlordProperties.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {landlordProperties.map(property => (
            <Card key={property.id} className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{property.name}</CardTitle>
                    <CardDescription>{property.address}</CardDescription>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-full">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>{property.type}</span>
                  <span className="font-semibold">{Array.isArray(property.units) ? property.units.length : 0} Units</span>
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                  <Button onClick={() => handleManageClick(property)} className="w-full">
                    <Edit className="mr-2 h-4 w-4" />
                    Manage Landlord
                  </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border-dashed border-2 rounded-lg">
          <h3 className="text-xl font-semibold">No Landlord Properties Found</h3>
          <p className="text-muted-foreground mt-2">
            No properties with units marked for 'Landlord' ownership were found.
          </p>
        </div>
      )}
      
      {selectedProperty && landlord && (
        <ManageLandlordDialog 
            isOpen={isDialogOpen}
            onClose={handleDialogClose}
            landlord={landlord}
            property={selectedProperty}
            onSave={handleSaveLandlord}
        />
      )}
    </div>
  );
}
