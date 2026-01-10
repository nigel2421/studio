
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addWaterMeterReading, getTenants } from '@/lib/data';
import type { Property, Tenant } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search } from 'lucide-react';

export default function AddWaterMeterReadingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [priorReading, setPriorReading] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchData() {
      const [tenantData, props] = await Promise.all([getTenants(), getProperties()]);
      setTenants(tenantData);
      setProperties(props);
    }
    fetchData();
  }, []);

  const filteredTenants = useMemo(() => {
    if (!searchQuery) return tenants;
    return tenants.filter(tenant =>
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.unitName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, tenants]);

  const getPropertyName = (propertyId: string) => {
    return properties.find(p => p.id === propertyId)?.name || 'Unknown';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTenant = tenants.find(t => t.id === selectedTenantId);

    if (!selectedTenant || priorReading === '' || currentReading === '') {
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
        propertyId: selectedTenant.propertyId,
        unitName: selectedTenant.unitName,
        priorReading: Number(priorReading),
        currentReading: Number(currentReading),
      });
      toast({
        title: "Reading Added",
        description: `Water meter reading for ${selectedTenant.name} in unit ${selectedTenant.unitName} has been saved.`,
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
                <Label htmlFor="search">Search Tenant / Unit</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="search"
                        placeholder="Search by name or unit..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenant">Tenant & Unit</Label>
              <Select onValueChange={setSelectedTenantId} value={selectedTenantId}>
                <SelectTrigger id="tenant">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTenants.map(tenant => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} - {tenant.unitName} ({getPropertyName(tenant.propertyId)})
                    </SelectItem>
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
