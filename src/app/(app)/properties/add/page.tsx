
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { addProperty } from '@/lib/data';

export default function AddPropertyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [address, setAddress] = useState('');
  const [units, setUnits] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addProperty({ name, type, address, units });
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
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div>
            <Label htmlFor="units">Units (comma-separated)</Label>
            <Input id="units" value={units} onChange={(e) => setUnits(e.target.value)} required />
          </div>
          <Button type="submit">Save Property</Button>
        </form>
      </CardContent>
    </Card>
  );
}
