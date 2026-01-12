
'use client';

import { useEffect, useState } from 'react';
import { getLandlords } from '@/lib/data';
import type { Landlord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function LandlordsPage() {
  const [landlords, setLandlords] = useState<Landlord[]>([]);

  useEffect(() => {
    getLandlords().then(setLandlords);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Landlords</h2>
        <p className="text-muted-foreground">A list of all landlords in the system.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Landlords</CardTitle>
          <CardDescription>
            {landlords.length} landlord(s) found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Bank Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {landlords.map((landlord) => (
                <TableRow key={landlord.id}>
                  <TableCell className="font-medium">{landlord.name}</TableCell>
                  <TableCell>{landlord.email}</TableCell>
                  <TableCell>{landlord.phone}</TableCell>
                  <TableCell>{landlord.bankAccount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
