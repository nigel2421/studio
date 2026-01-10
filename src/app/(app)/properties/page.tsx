
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getProperties, getTenants } from '@/lib/data';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { PlusCircle, Edit, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState, useMemo } from 'react';
import { Property, Tenant, Unit } from '@/lib/types';
import { Input } from '@/components/ui/input';

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getProperties().then(setProperties);
    getTenants().then(setTenants);
  }, []);

  const getImage = (imageId: string) => {
    return PlaceHolderImages.find((img) => img.id === imageId);
  };

  const filteredProperties = useMemo(() => {
    if (!searchQuery) {
      return properties;
    }
    const lowercasedQuery = searchQuery.toLowerCase();
    return properties
      .map((property) => {
        const filteredUnits = property.units.filter((unit) =>
          unit.name.toLowerCase().includes(lowercasedQuery)
        );
        // If the property name matches, show all units
        if (property.name.toLowerCase().includes(lowercasedQuery)) {
            return property;
        }
        return { ...property, units: filteredUnits };
      })
      .filter((property) => property.units.length > 0 || property.name.toLowerCase().includes(lowercasedQuery));
  }, [searchQuery, properties]);

  const getTenantForUnit = (propertyId: string, unitName: string) => {
    return tenants.find(
      (tenant) => tenant.propertyId === propertyId && tenant.unitName === unitName
    );
  };

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
                        placeholder="Search property or unit..."
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
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filteredProperties.map((property) => {
            const image = getImage(property.imageId);
            return (
            <Card key={property.id} className="overflow-hidden flex flex-col">
                <div className="p-0">
                    {image && (
                        <div className="aspect-video relative w-full">
                            <Image
                            src={image.imageUrl}
                            alt={image.description}
                            data-ai-hint={image.imageHint}
                            fill
                            className="object-cover"
                            />
                        </div>
                    )}
                </div>
                <CardHeader className="flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle>{property.name}</CardTitle>
                        <CardDescription>{property.type}</CardDescription>
                    </div>
                     <Button asChild variant="outline" size="icon">
                        <Link href={`/properties/edit/${property.id}`}>
                            <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit Property</span>
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent className="pt-0 flex-grow">
                <p className="text-sm text-muted-foreground">{property.address}</p>
                {property.units && Array.isArray(property.units) && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Units ({property.units.length})</h4>
                    <div className="flex flex-col gap-2">
                      {property.units.map((unit, index) => {
                        const tenant = getTenantForUnit(property.id, unit.name);
                        return (
                           <Dialog key={`${unit.name}-${index}`}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full justify-between">
                                    <span>{unit.name}</span>
                                    <Badge variant={unit.status === 'vacant' ? 'secondary' : unit.status === 'client occupied' ? 'outline' : 'default'} className="capitalize"> 
                                        {unit.status}
                                    </Badge>
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Unit Details: {unit.name}</DialogTitle>
                                </DialogHeader>
                                {tenant ? (
                                    <div className="text-sm space-y-2">
                                        <p><span className="font-medium text-foreground">Tenant:</span> {tenant.name}</p>
                                        <p><span className="font-medium text-foreground">Email:</span> {tenant.email}</p>
                                        <p><span className="font-medium text-foreground">Phone:</span> {tenant.phone}</p>
                                        <p><span className="font-medium text-foreground">Rent:</span> Ksh {tenant.lease.rent.toLocaleString()}</p>
                                        <p><span className="font-medium text-foreground">Payment Status:</span> <Badge variant={tenant.lease.paymentStatus === 'Paid' ? 'default' : tenant.lease.paymentStatus === 'Overdue' ? 'destructive' : 'secondary'} className="capitalize">{tenant.lease.paymentStatus}</Badge></p>
                                        <p><span className="font-medium text-foreground">Ownership:</span> {unit.ownership}</p>
                                        <p><span className="font-medium text-foreground">Type:</span> {unit.unitType}</p>
                                    </div>
                                ) : (
                                    <div className="text-sm space-y-2">
                                        <p>This unit is currently <span className="font-medium">{unit.status}</span>.</p>
                                        <p><span className="font-medium text-foreground">Ownership:</span> {unit.ownership}</p>
                                        <p><span className="font-medium text-foreground">Type:</span> {unit.unitType}</p>
                                    </div>
                                )}
                            </DialogContent>
                           </Dialog>
                        )
                      })}
                    </div>
                  </div>
                )}
                </CardContent>
            </Card>
            );
        })}
        </div>
    </div>
  );
}
