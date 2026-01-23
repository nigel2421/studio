
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addWaterMeterReading, getTenants } from '@/lib/data';
import type { Property } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { useUnitFilter } from '@/hooks/useUnitFilter';
import { useLoading } from '@/hooks/useLoading';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function AddWaterMeterReadingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [priorReading, setPriorReading] = useState('');
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

  const { startLoading, stopLoading } = useLoading();

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
    startLoading('Recording Water Reading...');

    try {
      await addWaterMeterReading({
        propertyId: selectedProperty,
        unitName: selectedUnit,
        priorReading: Number(priorReading),
        currentReading: Number(currentReading),
        date: readingDate ? format(readingDate, 'yyyy-MM-dd') : new Date().toISOString().split('T')[0],
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
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn(
                        "w-full justify-start text-left font-normal",
                        !readingDate && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {readingDate ? format(readingDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={readingDate}
                        onSelect={setReadingDate}
                        disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                        }
                    />
                    </PopoverContent>
                </Popover>
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
