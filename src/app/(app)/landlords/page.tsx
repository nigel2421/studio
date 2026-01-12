
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
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Loader } from 'lucide-react';

export default function LandlordsPage() {
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const { userProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until authentication is resolved before doing anything
    if (isLoading) {
      return; 
    }

    // After loading, if the user is not an admin, redirect them.
    if (userProfile?.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    
    // If they are an admin, fetch the data.
    getLandlords().then(setLandlords);

  }, [userProfile, isLoading, router]);

  // While loading auth state, show a loading spinner and do not render the page.
  // This prevents the "flash" of content before a potential redirect.
  if (isLoading || !userProfile) {
    return (
        <div className="flex h-48 items-center justify-center">
            <Loader className="h-8 w-8 animate-spin" />
        </div>
    );
  }
  
  // If loading is complete but the user is not an admin, they will have already been redirected.
  // We can safely render the admin-only content here.

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
