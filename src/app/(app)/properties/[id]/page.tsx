
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProperty } from '@/lib/data';
import { Property, Unit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Edit, ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function PropertyDetailsPage() {
    const { id } = useParams();
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            getProperty(id as string).then((data) => {
                setProperty(data);
                setLoading(false);
            });
        }
    }, [id]);

    if (loading) {
        return (
            <div>
                <Skeleton className="h-8 w-1/4 mb-4" />
                <Skeleton className="h-4 w-1/2 mb-6" />
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/3" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!property) {
        return (
            <div className="text-center">
                <h2 className="text-2xl font-semibold mb-4">Property not found</h2>
                <Button asChild>
                    <Link href="/properties">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Properties
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Button asChild variant="ghost" className="mb-2">
                        <Link href="/properties">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Properties
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold">{property.name}</h1>
                    <p className="text-muted-foreground">{property.address}</p>
                </div>
                <Button asChild>
                    <Link href={`/properties/edit/${property.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Property
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Units</CardTitle>
                    <CardDescription>
                        A list of all units in {property.name}.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Unit Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Ownership</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {property.units.map((unit, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{unit.name}</TableCell>
                                    <TableCell>{unit.unitType}</TableCell>
                                    <TableCell>{unit.ownership}</TableCell>
                                    <TableCell>
                                        <Badge variant={unit.status === 'vacant' ? 'secondary' : unit.status === 'client occupied' ? 'outline' : 'default'} className="capitalize">
                                            {unit.status}
                                        </Badge>
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
