'use client';

import { useEffect, useState, useMemo } from 'react';
import { getLandlords, getProperties, addOrUpdateLandlord } from '@/lib/data';
import type { Landlord, Property, Unit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LandlordCsvUploader } from '@/components/landlord-csv-uploader';
import { Building2, PlusCircle, Edit, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManageLandlordDialog } from '@/components/manage-landlord-dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function LandlordsPage() {
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null);
  const { toast } = useToast();

  const fetchData = () => {
    getLandlords().then(setLandlords);
    getProperties().then(setProperties);
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
                if (u.ownership === 'Landlord') {
                    if (u.landlordId) {
                        if (!map.has(u.landlordId)) {
                            map.set(u.landlordId, []);
                        }
                        map.get(u.landlordId)!.push({ ...u, propertyName: p.name, propertyId: p.id });
                    } else {
                        unassigned.push({ ...u, propertyName: p.name, propertyId: p.id });
                    }
                }
            });
        }
    });
    return { landlordUnitsMap: map, unassignedLandlordUnits: unassigned };
  }, [properties]);

  const handleOpenDialog = (landlord: Landlord | null) => {
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
      fetchData(); // Refresh all data
      setIsManageDialogOpen(false);
    } catch(e: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e.message || 'Failed to save landlord details.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Landlords</h2>
          <p className="text-muted-foreground">Manage landlords and their assigned units.</p>
        </div>
        <div className="flex gap-2">
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {landlords.map((landlord) => {
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
                        <Edit className="h-4 w-4 mr-2"/> Edit
                    </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <h4 className="text-sm font-semibold mb-3 border-t pt-3">Assigned Units ({assignedUnits.length})</h4>
                {assignedUnits.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {assignedUnits.map((unit, index) => (
                      <li key={index} className="flex justify-between items-center group">
                        <span>
                          <span className="font-medium">{unit.propertyName}:</span> Unit {unit.name}
                        </span>
                        <Link href={`/properties/${unit.propertyId}`}>
                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No units assigned yet.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      
      {isManageDialogOpen && (
        <ManageLandlordDialog 
            isOpen={isManageDialogOpen}
            onClose={() => setIsManageDialogOpen(false)}
            landlord={selectedLandlord}
            properties={properties}
            onSave={handleSaveLandlord}
        />
      )}
    </div>
  );
}
