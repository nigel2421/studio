
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getTenants, getProperties, addPayment } from '@/lib/data';
import type { Tenant, Property, Payment, Unit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Percent, Users, UserX, PlusCircle, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUnitFilter } from '@/hooks/useUnitFilter';

function AddPaymentDialog({ properties, tenants, onPaymentAdded }: { properties: Property[], tenants: Tenant[], onPaymentAdded: () => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [notes, setNotes] = useState('');

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

    const occupiedUnitsOnFloor = useMemo(() => {
        if (!unitsOnFloor.length) return [];
        const tenantsOnProperty = tenants.filter(t => t.propertyId === selectedProperty);
        const occupiedUnitNames = new Set(tenantsOnProperty.map(t => t.unitName));
        return unitsOnFloor.filter(u => occupiedUnitNames.has(u.name));
    }, [unitsOnFloor, tenants, selectedProperty]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedProperty || !selectedUnit || !amount || !date) {
            toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please fill out all required fields.' });
            return;
        }

        const tenant = tenants.find(t => t.propertyId === selectedProperty && t.unitName === selectedUnit);

        if (!tenant) {
            toast({ variant: 'destructive', title: 'Tenant Not Found', description: 'No active tenant found for the selected unit.' });
            return;
        }
        setIsLoading(true);
        try {
            await addPayment({
                tenantId: tenant.id,
                amount: Number(amount),
                date: format(date, 'yyyy-MM-dd'),
                notes,
            });
            toast({ title: 'Payment Added', description: 'The payment has been successfully recorded.' });
            onPaymentAdded();
            setOpen(false);
            // Reset form
            setSelectedProperty('');
            setSelectedFloor('');
            setSelectedUnit('');
            setAmount('');
            setDate(new Date());
            setNotes('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add payment.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Payment
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add Payment Record</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
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
                                        {occupiedUnitsOnFloor.map(unit => (
                                            <SelectItem key={unit.name} value={unit.name}>{unit.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount (Ksh)</Label>
                            <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date">Payment Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="notes">Notes (Optional)</Label>
                            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Payment
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}


export default function AccountsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const fetchAllData = () => {
    getTenants().then(setTenants);
    getProperties().then(setProperties);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const getPropertyName = (propertyId: string) => {
    const property = properties.find((p) => p.id === propertyId);
    return property ? property.name : 'N/A';
  };

  const getPaymentStatusVariant = (status?: Tenant['lease']['paymentStatus']) => {
    switch (status) {
      case 'Paid':
        return 'default';
      case 'Pending':
        return 'secondary';
      case 'Overdue':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const financialSummary = tenants.reduce(
    (acc, tenant) => {
      if (tenant.lease && typeof tenant.lease.rent === 'number') {
        const rent = tenant.lease.rent;
        if (tenant.lease.paymentStatus === 'Paid') {
          acc.collected += rent;
        } else if (tenant.lease.paymentStatus === 'Pending') {
          acc.pending += rent;
        } else if (tenant.lease.paymentStatus === 'Overdue') {
          acc.overdue += rent;
        }
      }
      return acc;
    },
    { collected: 0, pending: 0, overdue: 0 }
  );

  const totalUnits = properties.reduce((sum, p) => sum + (Array.isArray(p.units) ? p.units.length : 0), 0);
  const occupiedUnits = tenants.length;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
  
  const stats = [
    { title: "Rent Collected", value: `Ksh ${financialSummary.collected.toLocaleString()}`, icon: DollarSign, color: "text-green-500" },
    { title: "Rent Pending", value: `Ksh ${financialSummary.pending.toLocaleString()}`, icon: Users, color: "text-yellow-500" },
    { title: "Rent Overdue", value: `Ksh ${financialSummary.overdue.toLocaleString()}`, icon: UserX, color: "text-red-500" },
    { title: "Occupancy Rate", value: `${occupancyRate.toFixed(1)}%`, icon: Percent, color: "text-blue-500" },
  ];

  return (
    <div className="flex flex-col gap-8">
       <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Accounts Dashboard</h2>
                <p className="text-muted-foreground">A financial overview of your properties.</p>
            </div>
            <AddPaymentDialog properties={properties} tenants={tenants} onPaymentAdded={fetchAllData} />
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
                <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                    {stat.title}
                    </CardTitle>
                    <stat.icon className={`h-4 w-4 text-muted-foreground ${stat.color}`} />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
                </Card>
            ))}
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Financial Status</CardTitle>
           <CardDescription>Detailed list of tenant lease and payment information.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Rent Amount</TableHead>
                <TableHead className="text-right">Payment Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <div className="font-medium">{tenant.name}</div>
                    <div className="text-sm text-muted-foreground">{tenant.email}</div>
                  </TableCell>
                  <TableCell>
                    <div>{getPropertyName(tenant.propertyId)}</div>
                    <div className="text-sm text-muted-foreground">Unit: {tenant.unitName}</div>
                  </TableCell>
                  <TableCell>
                    {tenant.lease && typeof tenant.lease.rent === 'number'
                        ? `Ksh ${tenant.lease.rent.toLocaleString()}`
                        : 'N/A'
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={getPaymentStatusVariant(tenant.lease?.paymentStatus)}>
                      {tenant.lease?.paymentStatus || 'N/A'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
