'use client';

import { useEffect, useState } from 'react';
import type { Property, Tenant, UnitType } from '@/lib/types';
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

type AnalyticsData = {
  rentedSM: number;
  rentedLandlord: number;
  vacant: number;
  bookedWithDeposit: number;
};

interface UnitAnalyticsProps {
  property: Property;
  tenants: Tenant[];
}

const unitTypesToTrack: UnitType[] = ['Studio', 'One Bedroom', 'Two Bedroom'];

export function UnitAnalytics({ property, tenants }: UnitAnalyticsProps) {
  const [analytics, setAnalytics] = useState<Record<UnitType, AnalyticsData> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function calculateAnalytics() {
      setLoading(true);
      const analyticsData = unitTypesToTrack.reduce((acc, type) => {
        acc[type] = {
          rentedSM: 0,
          rentedLandlord: 0,
          vacant: 0,
          bookedWithDeposit: 0,
        };
        return acc;
      }, {} as Record<UnitType, AnalyticsData>);

      if (!Array.isArray(property.units)) {
        setAnalytics(analyticsData);
        setLoading(false);
        return;
      }

      property.units.forEach(unit => {
        if (!unitTypesToTrack.includes(unit.unitType)) return;

        const tenant = tenants.find(t => t.propertyId === property.id && t.unitName === unit.name);

        if (tenant) { // Unit is occupied by a tenant
          if (unit.ownership === 'SM') {
            analyticsData[unit.unitType].rentedSM++;
          } else if (unit.ownership === 'Landlord') {
            analyticsData[unit.unitType].rentedLandlord++;
          }

          if (tenant.securityDeposit > 0) {
            analyticsData[unit.unitType].bookedWithDeposit++;
          }
        } else if (unit.status === 'vacant') { // Unit is vacant
          analyticsData[unit.unitType].vacant++;
        }
      });

      setAnalytics(analyticsData);
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

  if (!analytics) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{property.name} - Unit Analytics</CardTitle>
        <CardDescription>
          A detailed breakdown of units for this property by type and status.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit Type</TableHead>
              <TableHead className="text-center">Rented (SM)</TableHead>
              <TableHead className="text-center">Rented (Landlord)</TableHead>
              <TableHead className="text-center">Vacant</TableHead>
              <TableHead className="text-center">Booked w/ Deposit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unitTypesToTrack.map((unitType) => (
              <TableRow key={unitType}>
                <TableCell className="font-medium">{unitType}</TableCell>
                <TableCell className="text-center">{analytics[unitType].rentedSM}</TableCell>
                <TableCell className="text-center">{analytics[unitType].rentedLandlord}</TableCell>
                <TableCell className="text-center">{analytics[unitType].vacant}</TableCell>
                <TableCell className="text-center">{analytics[unitType].bookedWithDeposit}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
