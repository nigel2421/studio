
'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getProperties } from '@/lib/data';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { PlusCircle, Search } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { Property } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { UnitCsvUploader } from '@/components/unit-csv-uploader';

export default function PropertiesListPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchProperties = () => {
    getProperties().then(setProperties);
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const getImage = (imageId: string) => {
    return PlaceHolderImages.find((img) => img.id === imageId);
  };

  const filteredProperties = useMemo(() => {
    if (!searchQuery) {
      return properties;
    }
    const lowercasedQuery = searchQuery.toLowerCase();
    return properties.filter(
      (property) =>
        property.name.toLowerCase().includes(lowercasedQuery) ||
        property.address.toLowerCase().includes(lowercasedQuery)
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
              placeholder="Search by name or address..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <UnitCsvUploader onUploadComplete={fetchProperties} />
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
            <Link href={`/properties/${property.id}`} key={property.id} className="block">
              <Card className="overflow-hidden flex flex-col h-full hover:shadow-lg transition-shadow">
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
                <CardHeader>
                  <CardTitle>{property.name}</CardTitle>
                  <CardDescription>{property.address}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 flex-grow">
                  <p className="text-sm text-muted-foreground">{property.type}</p>
                   <p className="text-sm font-medium mt-2">{Array.isArray(property.units) ? property.units.length : 0} Units</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
