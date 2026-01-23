
'use client';

import { useEffect, useState } from 'react';
import type { Property, Tenant, UnitType } from '@/lib/types';
import { unitTypes } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from './ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [unitTypeFilter, setUnitTypeFilter] = useState<UnitType | 'all'>('all');

  useEffect(() => {
    function calculateAnalytics() {
      setLoading(true);
      const floors = new Map<string, FloorAnalyticsData>();

      if (!Array.isArray(property.units)) {
        setAnalytics({});
        setLoading(false);
        return;
      }

      const filteredUnits = property.units.filter(unit =>
        unitTypeFilter === 'all' || unit.unitType === unitTypeFilter
      );
      
      // Initialize map with all floors
      filteredUnits.forEach(unit => {
        const floorNumber = parseFloorFromUnitName(unit.name);
        if (floorNumber) {
          if (!floors.has(floorNumber)) {
            floors.set(floorNumber, {
              rentedSM: 0,
              rentedLandlord: 0,
              vacant: 0,
              totalUnits: 0,
            });
          }
        }
      });

      // Populate the analytics data
      filteredUnits.forEach(unit => {
        const floorNumber = parseFloorFromUnitName(unit.name);
        if (!floorNumber) return;

        const floorData = floors.get(floorNumber);
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
          return parseInt(a[0]) - parseInt(b[0]);
      }));

      setAnalytics(Object.fromEntries(sortedFloors));
      setLoading(false);
    }

    if (property && tenants) {
      calculateAnalytics();
    }
  }, [property, tenants, unitTypeFilter]);

  if (loading) {
    return (
      <div className="space-y-4 pt-4">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-[180px]" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!analytics || Object.keys(analytics).length === 0) {
    return (
        <div className="text-center py-10 border rounded-lg mt-4">
            <p className="text-sm text-muted-foreground">No units found for the selected filter in this property.</p>
        </div>
    );
  }

  return (
    <div className="pt-4 space-y-4">
        <div className="flex justify-end">
            <Select value={unitTypeFilter} onValueChange={(value) => setUnitTypeFilter(value as UnitType | 'all')}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by Unit Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Unit Types</SelectItem>
                    {unitTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <div className="border rounded-md overflow-x-auto">
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
        </div>
    </div>
  );
}
