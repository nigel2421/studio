'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { addProperty } from '@/lib/data';
import { Unit, UnitType, unitTypes, OwnershipType, ownershipTypes, ManagementStatus, managementStatuses, UnitOrientation, unitOrientations } from '@/lib/types';
import { X, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AddPropertyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [address, setAddress] = useState('');
  const [units, setUnits] = useState<Omit<Unit, 'status'>[]>([{ name: '', unitType: 'Studio', ownership: 'SM', managementStatus: 'Rented for Soil Merchants' }]);

  const handleUnitChange = (index: number, field: keyof Omit<Unit, 'status'>, value: string) => {
    const newUnits = [...units];
    newUnits[index] = { ...newUnits[index], [field]: value };
    setUnits(newUnits);
  };

  const addUnit = () => {
    setUnits([...units, { name: '', unitType: 'Studio', ownership: 'SM', managementStatus: 'Rented for Soil Merchants' }]);
  };

  const removeUnit = (index: number) => {
    const newUnits = units.filter((_, i) => i !== index);
    setUnits(newUnits);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalUnits = units.map(unit => ({ ...unit, status: 'vacant' as const }));
      await addProperty({ name, type, address, units: finalUnits });
      router.push('/properties');
    } catch (error) {
      console.error('Error adding property:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add New Property</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Property Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="type">Property Type</Label>
              <Input id="type" value={type} onChange={(e) => setType(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-4">
            <Label>Units</Label>
            {units.map((unit, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center p-4 border rounded-lg">
                <div className="md:col-span-1">
                  <Label htmlFor={`unit-name-${index}`}>Unit Name</Label>
                  <Input
                    id={`unit-name-${index}`}
                    value={unit.name}
                    onChange={(e) => handleUnitChange(index, 'name', e.target.value)}
                    required
                  />
                </div>
                 <div className="md:col-span-1">
                    <Label htmlFor={`unit-type-${index}`}>Unit Type</Label>
                    <Select value={unit.unitType} onValueChange={(value) => handleUnitChange(index, 'unitType', value)}>
                        <SelectTrigger id={`unit-type-${index}`}>
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            {unitTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 </div>
                 <div className="md:col-span-1">
                    <Label htmlFor={`ownership-${index}`}>Ownership</Label>
                     <Select value={unit.ownership} onValueChange={(value) => handleUnitChange(index, 'ownership', value)}>
                        <SelectTrigger id={`ownership-${index}`}>
                            <SelectValue placeholder="Select ownership" />
                        </SelectTrigger>
                        <SelectContent>
                            {ownershipTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 </div>
                 <div className="md:col-span-1">
                    <Label htmlFor={`unit-orientation-${index}`}>Orientation</Label>
                    <Select onValueChange={(value) => handleUnitChange(index, 'unitOrientation', value as UnitOrientation)}>
                        <SelectTrigger id={`unit-orientation-${index}`}>
                            <SelectValue placeholder="Select orientation" />
                        </SelectTrigger>
                        <SelectContent>
                            {unitOrientations.map(orientation => (
                                <SelectItem key={orientation} value={orientation}>{orientation}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 </div>
                 <div className="md:col-span-1">
                    <Label htmlFor={`management-status-${index}`}>Management Status</Label>
                     <Select value={unit.managementStatus} onValueChange={(value) => handleUnitChange(index, 'managementStatus', value)}>
                        <SelectTrigger id={`management-status-${index}`}>
                            <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                            {managementStatuses.map(status => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 </div>
                <div className="flex items-end h-full">
                  <Button type="button" variant="destructive" size="icon" onClick={() => removeUnit(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addUnit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Unit
            </Button>
          </div>
          
          <Button type="submit">Save Property</Button>
        </form>
      </CardContent>
    </Card>
  );
}
