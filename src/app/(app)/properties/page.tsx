
'use client';

import { useEffect, useState } from 'react';
import { getProperties } from '@/lib/data';
import type { Property } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, PlusCircle, Building2, Upload } from 'lucide-react';
import Link from 'next/link';
import { UnitBulkUpdateDialog } from '@/components/unit-bulk-update-dialog';

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchProperties = () => {
    getProperties().then(setProperties);
  }

  useEffect(() => {
    fetchProperties();
  }, []);

  const filteredProperties = properties.filter(property =>
    property.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
         <div>
            <h2 className="text-3xl font-bold tracking-tight">Properties</h2>
            <p className="text-muted-foreground">Manage your property portfolio.</p>
         </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search properties..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
           <UnitBulkUpdateDialog onUploadComplete={fetchProperties} />
          <Button asChild>
            <Link href="/properties/add">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Property
            </Link>
          </Button>
        </div>
      </div>
      
      {filteredProperties.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProperties.map(property => (
            <Link href={`/properties/${property.id}`} key={property.id} className="block">
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle>{property.name}</CardTitle>
                            <CardDescription>{property.address}</CardDescription>
                        </div>
                        <div className="p-3 bg-primary/10 rounded-full">
                            <Building2 className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>{property.type}</span>
                    <span className="font-semibold">{Array.isArray(property.units) ? property.units.length : 0} Units</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border-dashed border-2 rounded-lg">
            <h3 className="text-xl font-semibold">No properties found</h3>
            <p className="text-muted-foreground mt-2">
                {searchQuery ? `No properties match your search for "${searchQuery}".` : 'Get started by adding a new property.'}
            </p>
        </div>
      )}
    </div>
  );
}
