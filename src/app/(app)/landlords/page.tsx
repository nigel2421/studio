
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getLandlords, getProperties } from '@/lib/data';
import type { Landlord, Property, Unit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LandlordCsvUploader } from '@/components/landlord-csv-uploader';
import { Building2 } from 'lucide-react';

export default function LandlordsPage() {
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const fetchData = () => {
    getLandlords().then(setLandlords);
    getProperties().then(setProperties);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const landlordUnitsMap = useMemo(() => {
    const map = new Map<string, (Unit & { propertyName: string })[]>();
    if (!properties || properties.length === 0) return map;

    properties.forEach(p => {
        if (p.units) {
            p.units.forEach(u => {
                if (u.landlordId) {
                    if (!map.has(u.landlordId)) {
                        map.set(u.landlordId, []);
                    }
                    map.get(u.landlordId)!.push({ ...u, propertyName: p.name });
                }
            });
        }
    });
    return map;
  }, [properties]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Landlords</h2>
          <p className="text-muted-foreground">A list of all landlords and their assigned units.</p>
        </div>
        <LandlordCsvUploader onUploadComplete={fetchData} />
      </div>

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
                    <div className="p-3 bg-primary/10 rounded-xl">
                        <Building2 className="h-6 w-6 text-primary" />
                    </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <h4 className="text-sm font-semibold mb-3 border-t pt-3">Assigned Units</h4>
                {assignedUnits.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {assignedUnits.map((unit, index) => (
                      <li key={index} className="flex justify-between items-center">
                        <span>
                          <span className="font-medium">{unit.propertyName}:</span> Unit {unit.name}
                        </span>
                        <span className="text-muted-foreground text-xs">{unit.unitType}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No units assigned.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  );
}
