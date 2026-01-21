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
      
      property.units.forEach(unit => {
        const floorNumber = parseFloorFromUnitName(unit.name);
        if (floorNumber && !floors.has(floorNumber)) {
          floors.set(floorNumber, {
            rentedSM: 0,
            rentedLandlord: 0,
            vacant: 0,
            totalUnits: 0,
          });
        }
      });

      property.units.forEach(unit => {
        const floorNumber = parseFloorFromUnitName(unit.name);
        if (!floorNumber) return;

        const floorData = floors.get(floorNumber)!;
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
      
      const sortedFloors = new Map([...floors.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])));
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
        <CardTitle>{property.name} - Floor Analytics</CardTitle>
        <CardDescription>
          A detailed breakdown of units for this property by floor.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Floor</TableHead>
              <TableHead className="text-center">Rented (SM)</TableHead>
              <TableHead className="text-center">Rented (Landlord)</TableHead>
              <TableHead className="text-center">Vacant</TableHead>
              <TableHead className="text-center">Total Units</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(analytics).map(([floor, data]) => (
              <TableRow key={floor}>
                <TableCell className="font-medium">Floor {floor}</TableCell>
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
