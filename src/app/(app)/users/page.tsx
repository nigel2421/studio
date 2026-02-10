'use client';

import { useEffect, useState } from 'react';
import { getUsers, updateUserRole } from '@/lib/data';
import type { UserProfile, UserRole } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, Search, UserCog } from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { downloadCSV } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

const editableRoles: UserRole[] = ['admin', 'agent', 'viewer', 'water-meter-reader', 'investment-consultant', 'accounts'];

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const { user, userProfile, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';
    if (!isLoading && !isAdmin) {
      router.push('/dashboard');
    }
  }, [user, userProfile, isLoading, router]);

  const fetchUsers = async () => {
    const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';
    if (isAdmin) {
      const userData = await getUsers();
      setUsers(userData);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [user, userProfile]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    // Prevent admin from changing their own role to something else
    if (userId === userProfile?.id && newRole !== 'admin') {
        toast({
            variant: 'destructive',
            title: 'Action Forbidden',
            description: 'Admins cannot demote their own account.',
        });
        return;
    }
      
    try {
      await updateUserRole(userId, newRole);
      toast({
        title: 'Role Updated',
        description: `User role has been successfully changed to ${newRole}.`,
      });
      // Refresh user list
      fetchUsers();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update user role.',
      });
    }
  };
  
  const handleDownloadCSV = () => {
    const dataToExport = filteredUsers.map(user => ({
      Name: user.name || 'N/A',
      Email: user.email,
      Role: user.role,
    }));
    downloadCSV(dataToExport, 'users_list.csv');
  };

  const filteredUsers = users.filter(user =>
    (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';
  if (isLoading || !isAdmin) {
    return <div>Loading...</div>; // Or a more sophisticated loading/access denied component
  }

  const RoleSelector = ({ user }: { user: UserProfile }) => {
    if (!editableRoles.includes(user.role)) {
      return <Badge variant="secondary" className="capitalize">{user.role}</Badge>;
    }
    
    return (
      <Select
        defaultValue={user.role}
        onValueChange={(newRole) => handleRoleChange(user.id, newRole as UserRole)}
      >
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
                 <div className="relative w-full sm:w-[300px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
            </div>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
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
        </CardContent>
        <div className="p-4 border-t">
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredUsers.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </Card>
    </div>
  );
}
