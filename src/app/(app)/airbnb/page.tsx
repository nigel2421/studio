
'use client';

import { useEffect, useState } from 'react';
import { getProperties } from '@/lib/data';
import type { Property, Unit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BedDouble, Home } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { PaginationControls } from '@/components/ui/pagination-controls';

interface AirbnbUnit extends Unit {
  propertyName: string;
  propertyAddress: string;
}

export default function AirbnbPage() {
  const [airbnbUnits, setAirbnbUnits] = useState<AirbnbUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    async function fetchAndFilterProperties() {
      const properties = await getProperties();
      const units: AirbnbUnit[] = [];
      properties.forEach(prop => {
        prop.units.forEach(unit => {
          if (unit.status === 'airbnb') {
            units.push({
              ...unit,
              propertyName: prop.name,
              propertyAddress: prop.address,
            });
          }
        });
      });
      setAirbnbUnits(units);
      setLoading(false);
    }

    fetchAndFilterProperties();
  }, []);

  const totalPages = Math.ceil(airbnbUnits.length / pageSize);
  const paginatedUnits = airbnbUnits.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
  );

  if (loading) {
    return (
        <div className="flex items-center justify-center h-full">
            <BedDouble className="h-8 w-8 text-primary animate-pulse"/>
        </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Airbnb</h2>
          <p className="text-muted-foreground">
            A list of all units currently designated as Airbnb rentals.
          </p>
        </div>
        <div className="p-3 bg-primary/10 rounded-full">
          <BedDouble className="h-6 w-6 text-primary" />
        </div>
      </div>

      {airbnbUnits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Airbnb Units</CardTitle>
            <CardDescription>
              Found {airbnbUnits.length} unit(s) marked for Airbnb.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Unit Name</TableHead>
                  <TableHead>Unit Type</TableHead>
                  <TableHead>Ownership</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUnits.map((unit, index) => (
                  <TableRow key={`${unit.propertyName}-${unit.name}-${index}`}>
                    <TableCell>
                      <div className="font-medium">{unit.propertyName}</div>
                      <div className="text-sm text-muted-foreground">{unit.propertyAddress}</div>
                    </TableCell>
                    <TableCell>{unit.name}</TableCell>
                    <TableCell>{unit.unitType}</TableCell>
                    <TableCell>
                      <Badge variant={unit.ownership === 'Landlord' ? 'secondary' : 'default'}>
                        {unit.ownership}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="p-4 border-t">
              <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={airbnbUnits.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
              />
          </div>
        </Card>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg text-center">
            <div className="mx-auto bg-muted p-3 rounded-full mb-4 w-fit">
                <Home className="h-8 w-8 text-secondary-foreground"/>
            </div>
            <h3 className="text-xl font-semibold">No Airbnb Units Found</h3>
            <p className="text-muted-foreground mt-2 max-w-md">
              To list a unit here, go to the "Properties" page, select a property to edit, and change a unit's status to "airbnb".
            </p>
        </div>
      )}
    </div>
  );
}
