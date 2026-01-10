
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addWaterMeterReading } from '@/lib/data';
import type { Property, Unit } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function AddWaterMeterReadingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [rentedUnits, setRentedUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [priorReading, setPriorReading] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchProperties() {
      const props = await getProperties();
      setProperties(props);
    }
    fetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      const property = properties.find(p => p.id === selectedProperty);
      if (property) {
        setRentedUnits(property.units.filter(u => u.status === 'rented'));
      }
    } else {
      setRentedUnits([]);
    }
    setSelectedUnit('');
  }, [selectedProperty, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || !selectedUnit || priorReading === '' || currentReading === '') {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill out all fields.",
      });
      return;
    }

    setIsLoading(true);

    try {
      await addWaterMeterReading({
        propertyId: selectedProperty,
        unitName: selectedUnit,
        priorReading: Number(priorReading),
        currentReading: Number(currentReading),
      });
      toast({
        title: "Reading Added",
        description: `Water meter reading for unit ${selectedUnit} has been saved.`,
      });
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error adding water meter reading:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add reading. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-start pt-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Add Water Meter Reading</CardTitle>
          <CardDescription>Enter the new water meter reading for a tenant's unit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="property">Property</Label>
              <Select onValueChange={setSelectedProperty} value={selectedProperty}>
                <SelectTrigger id="property">
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(property => (
                    <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select onValueChange={setSelectedUnit} value={selectedUnit} disabled={!selectedProperty}>
                <SelectTrigger id="unit">
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {rentedUnits.map((unit, index) => (
                    <SelectItem key={`${unit.name}-${index}`} value={unit.name}>{unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="prior-reading">Prior Reading</Label>
                    <Input 
                        id="prior-reading" 
                        type="number" 
                        value={priorReading} 
                        onChange={(e) => setPriorReading(e.target.value)} 
                        placeholder="e.g., 1234"
                        required 
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="current-reading">Current Reading</Label>
                    <Input 
                        id="current-reading" 
                        type="number" 
                        value={currentReading} 
                        onChange={(e) => setCurrentReading(e.target.value)} 
                        placeholder="e.g., 1250"
                        required 
                    />
                </div>
            </div>
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Reading
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
