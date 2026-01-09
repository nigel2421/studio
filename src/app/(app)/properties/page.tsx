
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
import { Button } from '@/components/ui/button';
import { getProperties } from '@/lib/data';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { PlusCircle, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { Property } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    getProperties().then(setProperties);
  }, []);

  const getImage = (imageId: string) => {
    return PlaceHolderImages.find((img) => img.id === imageId);
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
            <Button asChild>
                <Link href="/properties/add">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Property
                </Link>
            </Button>
        </div>
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {properties.map((property) => {
            const image = getImage(property.imageId);
            return (
            <Card key={property.id} className="overflow-hidden flex flex-col">
                <CardHeader className="p-0">
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
                </CardHeader>
                <CardContent className="p-6 flex-grow">
                <CardTitle className="mb-1">{property.name}</CardTitle>
                <CardDescription>{property.type}</CardDescription>
                <p className="mt-4 text-sm text-muted-foreground">{property.address}</p>
                {property.units && Array.isArray(property.units) && (
                  <>
                    <div className="flex justify-between mt-4 text-sm text-muted-foreground">
                      <div>
                        <p className="font-medium">Total Units</p>
                        <p>{property.units.length}</p>
                      </div>
                      <div>
                        <p className="font-medium">Occupied Units</p>
                        <p>{property.units.filter(unit => unit.status === 'rented').length}</p>
                      </div>
                      <div>
                        <p className="font-medium">Vacant Units</p>
                        <p>{property.units.filter(unit => unit.status === 'vacant').length}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <h4 className="font-medium">Units</h4>
                      <ScrollArea className="h-48">
                          <ul className="list-disc list-inside text-sm text-muted-foreground">
                          {property.units.map((unit, index) => (
                              <li key={`${unit.name}-${index}`} className="flex items-center justify-between">
                                  <span>{unit.name}</span>
                                  <div>
                                      <Badge variant={unit.status === 'vacant' ? 'secondary' : 'default'}> 
                                          {unit.status}
                                      </Badge>
                                      <Badge variant='outline' className="ml-2 capitalize">{unit.managementType}</Badge>
                                  </div>
                              </li>
                          ))}
                          </ul>
                      </ScrollArea>
                    </div>
                  </>
                )}
                </CardContent>
                <CardFooter className="flex justify-end gap-2 p-6 pt-0">
                    <Button asChild variant="outline">
                        <Link href={`/properties/edit/${property.id}`}>
                            <Edit className="h-4 w-4" />
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
            );
        })}
        </div>
    </div>
  );
}
