
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getProperties, getLandlord, getTenants } from '@/lib/data';
import type { Property, Unit, Landlord, Tenant } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Building2, Home, Wallet, TrendingUp, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function LandlordDashboardPage() {
  const { userProfile, isLoading } = useAuth();
  const router = useRouter();
  const [ownedUnits, setOwnedUnits] = useState<({ propertyName: string } & Unit)[]>([]);
  const [landlord, setLandlord] = useState<Landlord | null>(null);
  const [rentCollected, setRentCollected] = useState(0);

  useEffect(() => {
    async function fetchData() {
      if (userProfile?.role === 'landlord' && userProfile.landlordId) {
        const [allProperties, landlordData, allTenants] = await Promise.all([
            getProperties(),
            getLandlord(userProfile.landlordId),
            getTenants()
        ]);
        
        setLandlord(landlordData);

        const units: ({ propertyName: string } & Unit)[] = [];
        allProperties.forEach(prop => {
          prop.units.forEach(unit => {
            if (unit.landlordId === userProfile.landlordId) {
              units.push({ ...unit, propertyName: prop.name });
            }
          });
        });
        setOwnedUnits(units);

        const landlordUnitNames = units.map(u => u.name);
        const collected = allTenants.reduce((acc, tenant) => {
            if (
                landlordUnitNames.includes(tenant.unitName) &&
                tenant.lease?.paymentStatus === 'Paid' &&
                typeof tenant.lease.rent === 'number'
            ) {
                return acc + tenant.lease.rent;
            }
            return acc;
        }, 0);
        setRentCollected(collected);
      }
    }
    fetchData();
  }, [userProfile]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };
  
  const getStatusVariant = (status: Unit['status']) => {
    switch (status) {
      case 'vacant': return 'secondary';
      case 'rented': return 'default';
      case 'client occupied': return 'outline';
      default: return 'outline';
    }
  };

  if (isLoading) {
      return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {landlord?.name || 'Landlord'}</h1>
          <p className="text-muted-foreground">Here is an overview of your property portfolio.</p>
        </div>
        <Button onClick={handleSignOut} variant="outline">
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Units</CardTitle>
                <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{ownedUnits.length}</div>
            </CardContent>
        </Card>
         <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Occupied Units</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{ownedUnits.filter(u => u.status === 'rented').length}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rent Collected</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">Ksh {rentCollected.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">From occupied units this period</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">
                    {ownedUnits.length > 0 ? ((ownedUnits.filter(u => u.status === 'rented').length / ownedUnits.length) * 100).toFixed(0) : 0}%
                </div>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Your Units</CardTitle>
            <CardDescription>A detailed list of all units you own across all properties.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Property</TableHead>
                        <TableHead>Unit Name</TableHead>
                        <TableHead>Unit Type</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {ownedUnits.map((unit, index) => (
                        <TableRow key={`${unit.propertyName}-${unit.name}-${index}`}>
                            <TableCell>{unit.propertyName}</TableCell>
                            <TableCell className="font-medium">{unit.name}</TableCell>
                            <TableCell>{unit.unitType}</TableCell>
                            <TableCell>
                                <Badge variant={getStatusVariant(unit.status)} className="capitalize">{unit.status}</Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
