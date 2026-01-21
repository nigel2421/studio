
'use client';

import { useEffect, useState } from 'react';
import type { Property, Tenant } from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from './ui/skeleton';

type FloorAnalyticsData = {
  rentedSM: number;
  rentedLandlord: number;
  vacant: number;
  totalUnits: number;
};

interface UnitAnalyticsProps {
  property: Property;
  tenants: Tenant[];
}

const parseFloorFromUnitName = (unitName: string): string | null => {
  const match = unitName.match(/(?:\s|-)(\d{1,2})(?:-|\s|$|[A-Z])/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
};

export function UnitAnalytics({ property, tenants }: UnitAnalyticsProps) {
  const [analytics, setAnalytics] = useState<Record<string, FloorAnalyticsData> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function calculateAnalytics() {
      setLoading(true);
      const floors = new Map<string, FloorAnalyticsData>();

      if (!Array.isArray(property.units)) {
        setAnalytics({});
        setLoading(false);
        return;
      }
      
      // Initialize map with all floor-unittype combinations
      property.units.forEach(unit => {
        const floorNumber = parseFloorFromUnitName(unit.name);
        const unitType = unit.unitType;
        if (floorNumber && unitType) {
          const key = `${floorNumber} - ${unitType}`;
          if (!floors.has(key)) {
            floors.set(key, {
              rentedSM: 0,
              rentedLandlord: 0,
              vacant: 0,
              totalUnits: 0,
            });
          }
        }
      });

      // Populate the analytics data
      property.units.forEach(unit => {
        const floorNumber = parseFloorFromUnitName(unit.name);
        const unitType = unit.unitType;
        if (!floorNumber || !unitType) return;

        const key = `${floorNumber} - ${unitType}`;
        const floorData = floors.get(key);
        if (!floorData) return;

        floorData.totalUnits++;

        const tenant = tenants.find(t => t.propertyId === property.id && t.unitName === unit.name);

        if (tenant) {
          if (unit.ownership === 'SM') {
            floorData.rentedSM++;
          } else if (unit.ownership === 'Landlord') {
            floorData.rentedLandlord++;
          }
        } else if (unit.status === 'vacant') {
          floorData.vacant++;
        }
      });
      
      const sortedFloors = new Map([...floors.entries()].sort((a, b) => {
          const [floorA, typeA] = a[0].split(' - ');
          const [floorB, typeB] = b[0].split(' - ');
          
          const floorNumA = parseInt(floorA);
          const floorNumB = parseInt(floorB);

          if (floorNumA !== floorNumB) {
              return floorNumA - floorNumB;
          }
          return typeA.localeCompare(typeB);
      }));

      setAnalytics(Object.fromEntries(sortedFloors));
      setLoading(false);
    }

    if (property && tenants) {
      calculateAnalytics();
    }
  }, [property, tenants]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4 p-6 pt-0">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analytics || Object.keys(analytics).length === 0) {
    // Don't render the card if there are no floors to analyze
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{property.name} - Unit Type Analytics</CardTitle>
        <CardDescription>
          A detailed breakdown of units for this property by floor and type.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Floor - Unit Type</TableHead>
              <TableHead className="text-center">Rented (SM)</TableHead>
              <TableHead className="text-center">Rented (Landlord)</TableHead>
              <TableHead className="text-center">Vacant</TableHead>
              <TableHead className="text-center">Total Units</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(analytics).map(([key, data]) => (
              <TableRow key={key}>
                <TableCell className="font-medium">{key}</TableCell>
                <TableCell className="text-center">{data.rentedSM}</TableCell>
                <TableCell className="text-center">{data.rentedLandlord}</TableCell>
                <TableCell className="text-center">{data.vacant}</TableCell>
                <TableCell className="text-center">{data.totalUnits}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
