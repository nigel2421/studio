
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addWaterMeterReading, getLatestWaterReading } from '@/lib/data';
import type { Property } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';
import { format } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';

export default function AddWaterMeterReadingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  
  const [priorReading, setPriorReading] = useState<number | null>(null);
  const [isPriorReadingLoading, setIsPriorReadingLoading] = useState(false);
  const [priorReadingSource, setPriorReadingSource] = useState<string | null>(null);

  const [currentReading, setCurrentReading] = useState('');
  const [readingDate, setReadingDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(false);

  const {
    selectedProperty,
    setSelectedProperty,
    selectedFloor,
    setSelectedFloor,
    selectedUnit,
    setSelectedUnit,
    floors,
    unitsOnFloor,
  } = useUnitFilter(properties);

  useEffect(() => {
    async function fetchData() {
      const props = await getProperties();
      setProperties(props);
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedUnit && selectedProperty) {
      const fetchPriorReading = async () => {
        setIsPriorReadingLoading(true);
        setPriorReading(null);
        setPriorReadingSource(null);

        const latestReading = await getLatestWaterReading(selectedProperty, selectedUnit);
        if (latestReading) {
          setPriorReading(latestReading.currentReading);
          setPriorReadingSource(`From last reading on ${format(new Date(latestReading.date), 'PPP')}`);
        } else {
          const property = properties.find(p => p.id === selectedProperty);
          const unit = property?.units.find(u => u.name === selectedUnit);
          if (unit && unit.baselineReading !== undefined) {
            setPriorReading(unit.baselineReading);
            setPriorReadingSource('From unit baseline reading');
          } else {
            setPriorReading(0);
            setPriorReadingSource('No previous reading or baseline found. Defaulted to 0.');
          }
        }
        setIsPriorReadingLoading(false);
      };
      fetchPriorReading();
    } else {
        setPriorReading(null);
        setPriorReadingSource(null);
    }
  }, [selectedUnit, selectedProperty, properties]);

  const consumption = (currentReading && priorReading !== null) ? Number(currentReading) - priorReading : 0;


  const { startLoading, stopLoading } = useLoading();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProperty || !selectedUnit || currentReading === '') {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill out all fields.",
      });
      return;
    }
    if (priorReading === null) {
        toast({ variant: "destructive", title: "Missing Information", description: "Prior reading is not set. Please select a unit." });
        return;
    }
    if (Number(currentReading) < priorReading) {
        toast({ variant: "destructive", title: "Invalid Reading", description: "Current reading cannot be less than the prior reading." });
        return;
    }
    if (!readingDate) {
      toast({
        variant: "destructive",
        title: "Missing Date",
        description: "Please select a reading date.",
      });
      return;
    }

    setIsLoading(true);
    startLoading('Recording Water Reading...');

    try {
      await addWaterMeterReading({
        propertyId: selectedProperty,
        unitName: selectedUnit,
        priorReading: priorReading,
        currentReading: Number(currentReading),
        date: format(readingDate, 'yyyy-MM-dd'),
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
      stopLoading();
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
              <Label htmlFor="development">Development</Label>
              <Select onValueChange={setSelectedProperty} value={selectedProperty}>
                <SelectTrigger id="development">
                  <SelectValue placeholder="Select a development" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(prop => (
                    <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="floor">Floor</Label>
                <Select onValueChange={setSelectedFloor} value={selectedFloor} disabled={!selectedProperty}>
                  <SelectTrigger id="floor">
                    <SelectValue placeholder="Select floor" />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map(floor => (
                      <SelectItem key={floor} value={floor}>{floor}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select onValueChange={setSelectedUnit} value={selectedUnit} disabled={!selectedFloor}>
                  <SelectTrigger id="unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitsOnFloor.map(unit => (
                      <SelectItem key={unit.name} value={unit.name}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="reading-date">Reading Date</Label>
                <DatePicker value={readingDate} onChange={setReadingDate} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prior-reading">Prior Reading</Label>
                <div className="relative">
                    <Input
                      id="prior-reading"
                      type="number"
                      value={priorReading === null ? '' : priorReading}
                      readOnly
                      className="bg-muted font-medium"
                    />
                    {isPriorReadingLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {priorReadingSource && <p className="text-xs text-muted-foreground pt-1">{priorReadingSource}</p>}
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
                  disabled={priorReading === null}
                />
              </div>
            </div>
            
            {consumption > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <p className="text-sm text-blue-800">Consumption: <span className="font-bold">{consumption} units</span></p>
                </div>
            )}

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
