
'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getProperties, getTenants } from '@/lib/data';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { PlusCircle, Edit, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState, useMemo } from 'react';
import { Property, Tenant, Unit } from '@/lib/types';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getProperties().then(setProperties);
  }, []);


  const filteredProperties = useMemo(() => {
    if (!searchQuery) {
      return properties;
    }
    const lowercasedQuery = searchQuery.toLowerCase();
    return properties.filter(
        (property) =>
            property.name.toLowerCase().includes(lowercasedQuery)
    );
  }, [searchQuery, properties]);


  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
         <div className="flex items-center justify-between w-full mb-6">
           <h2 className="text-2xl font-semibold">No Properties Found</h2>
            <Button asChild>
                <Link href="/properties/add">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Property
                </Link>
            </Button>
        </div>
        <p className="mt-2 text-muted-foreground">
          Get started by adding your first property.
        </p>
      </div>
    );
  }

  return (
    <div>
        <div className="flex items-center justify-between w-full mb-6">
            <h2 className="text-2xl font-semibold">Properties</h2>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search for a property..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button asChild>
                    <Link href="/properties/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Property
                    </Link>
                </Button>
            </div>
        </div>
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Property Name</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Units</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredProperties.map((property) => (
                            <TableRow key={property.id}>
                                <TableCell className="font-medium">{property.name}</TableCell>
                                <TableCell>{property.address}</TableCell>
                                <TableCell>{property.type}</TableCell>
                                <TableCell>{property.units.length}</TableCell>
                                <TableCell className="text-right">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/properties/edit/${property.id}`}>
                                            <Edit className="mr-2 h-4 w-4" />
                                            Edit
                                        </Link>
                                    </Button>
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
