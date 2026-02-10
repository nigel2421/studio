
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getUsers, updateUserRole } from '@/lib/data';
import type { UserProfile, UserRole } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, Search, UserCog, Filter, X } from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { downloadCSV } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

const editableRoles: UserRole[] = ['admin', 'agent', 'viewer', 'water-meter-reader', 'investment-consultant', 'accounts'];
const allFilterableRoles: UserRole[] = [...editableRoles, 'tenant', 'landlord', 'homeowner'];

export default function UsersPage() {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  
  const { user, userProfile, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Read filters from URL
  const roleFilters = useMemo(() => searchParams.getAll('role') as UserRole[], [searchParams]);
  const searchQuery = useMemo(() => searchParams.get('search') || '', [searchParams]);
  const currentPage = useMemo(() => Number(searchParams.get('page')) || 1, [searchParams]);

  // State for controlled inputs
  const [pageSize, setPageSize] = useState(10);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      router.push('/dashboard');
    }
  }, [user, userProfile, isAuthLoading, router, isAdmin]);
  
  const fetchUsers = useCallback(async () => {
    if (isAdmin) {
      setIsLoadingUsers(true);
      try {
        const userData = await getUsers();
        setAllUsers(userData);
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load users.'});
      } finally {
        setIsLoadingUsers(false);
      }
    }
  }, [isAdmin, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounce search input
  useEffect(() => {
      const handler = setTimeout(() => {
          if (localSearch !== searchQuery) {
              const params = new URLSearchParams(searchParams.toString());
              if (localSearch) {
                  params.set('search', localSearch);
              } else {
                  params.delete('search');
              }
              params.set('page', '1');
              router.replace(`${pathname}?${params.toString()}`);
          }
      }, 300);

      return () => {
          clearTimeout(handler);
      };
  }, [localSearch, searchQuery, pathname, router, searchParams]);

  const handleRoleToggle = useCallback((role: UserRole) => {
    const params = new URLSearchParams(searchParams.toString());
    const existingRoles = params.getAll('role');
    if (existingRoles.includes(role)) {
        const newRoles = existingRoles.filter(r => r !== role);
        params.delete('role');
        newRoles.forEach(r => params.append('role', r));
    } else {
        params.append('role', role);
    }
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);
  
  const clearFilters = () => {
      router.replace(pathname);
      setLocalSearch('');
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (userId === userProfile?.id && newRole !== 'admin') {
        toast({ variant: 'destructive', title: 'Action Forbidden', description: 'Admins cannot demote their own account.' });
        return;
    }
    try {
      await updateUserRole(userId, newRole);
      toast({ title: 'Role Updated', description: `User role has been successfully changed to ${newRole}.` });
      fetchUsers();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update user role.' });
    }
  };
  
  const filteredUsers = useMemo(() => {
    return allUsers.filter(user => {
      const roleMatch = roleFilters.length === 0 || roleFilters.includes(user.role);
      const searchMatch = !searchQuery ||
        (user.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      return roleMatch && searchMatch;
    });
  }, [allUsers, roleFilters, searchQuery]);
  
  const handleDownloadCSV = () => {
    const dataToExport = filteredUsers.map(user => ({
      Name: user.name || 'N/A',
      Email: user.email,
      Role: user.role,
    }));
    downloadCSV(dataToExport, 'users_list.csv');
  };

  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const isFiltered = roleFilters.length > 0 || searchQuery;

  if (isAuthLoading || !isAdmin) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  const RoleSelector = ({ user }: { user: UserProfile }) => {
    if (!editableRoles.includes(user.role)) {
      return <Badge variant="secondary" className="capitalize">{user.role}</Badge>;
    }
    return (
      <Select defaultValue={user.role} onValueChange={(newRole) => handleRoleChange(user.id, newRole as UserRole)}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          {editableRoles.map(role => (
            <SelectItem key={role} value={role} className="capitalize">{role.replace('-', ' ')}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Manage roles and access for your team.</p>
        </div>
        <div className="p-3 bg-primary/10 rounded-full">
          <UserCog className="h-6 w-6 text-primary" />
        </div>
      </div>
      <Card>
        <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-1">
                                <Filter className="h-4 w-4" />
                                <span>Roles</span>
                                {roleFilters.length > 0 && <Badge variant="secondary" className="rounded-full px-2">{roleFilters.length}</Badge>}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56">
                            <DropdownMenuLabel>Filter by Role</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {allFilterableRoles.map(role => (
                                <DropdownMenuCheckboxItem
                                    key={role}
                                    checked={roleFilters.includes(role)}
                                    onSelect={(e) => e.preventDefault()}
                                    onCheckedChange={() => handleRoleToggle(role)}
                                    className="capitalize"
                                >
                                    {role.replace('-', ' ')}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                     <div className="relative w-full sm:w-[300px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            className="pl-9"
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                        />
                    </div>
                    {isFiltered && (
                        <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                            <X className="mr-2 h-4 w-4" />
                            Clear
                        </Button>
                    )}
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadCSV} disabled={filteredUsers.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
            </div>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          {isLoadingUsers ? (
            <div className="space-y-4 p-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-4 p-4">
                {paginatedUsers.map((user) => (
                  <Card key={user.id}>
                    <CardHeader>
                      <CardTitle className="text-base">{user.name || <span className="italic text-muted-foreground">Not set</span>}</CardTitle>
                      <CardDescription>{user.email}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Label className="text-xs text-muted-foreground">Role</Label>
                      <RoleSelector user={user} />
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.name || <span className="text-muted-foreground italic">Not set</span>}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <RoleSelector user={user} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
         <div className="p-4 border-t">
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredUsers.length}
            onPageChange={(p) => router.replace(`${pathname}?${new URLSearchParams({...Object.fromEntries(searchParams.entries()), page: String(p)})}`)}
            onPageSizeChange={setPageSize}
          />
        </div>
      </Card>
    </div>
  );
}
