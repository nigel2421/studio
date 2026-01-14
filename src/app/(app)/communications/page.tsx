
'use client';

import { useEffect, useState } from 'react';
import { getLogs, getUserProfile } from '@/lib/data';
import type { Log, UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function CommunicationsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const { user, userProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    async function fetchData() {
      const allLogs = await getLogs();
      const emailLogs = allLogs.filter(log => log.action.startsWith('Sent payment receipt to'));
      setLogs(emailLogs);

      const userIds = [...new Set(emailLogs.map(log => log.userId))];
      const userPromises = userIds.map(id => getUserProfile(id));
      const userResults = await Promise.all(userPromises);

      const userMap = new Map<string, UserProfile>();
      userResults.forEach(user => {
        if (user) {
          userMap.set(user.id, user);
        }
      });
      setUsers(userMap);
    }
    fetchData();
  }, []);

  const getUserEmail = (userId: string) => {
    return users.get(userId)?.email || 'Unknown';
  };
  
  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Communications</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Email Sending History</CardTitle>
          <CardDescription>A log of all payment receipts sent from the system.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Sent By</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length > 0 ? logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{getUserEmail(log.userId)}</TableCell>
                  <TableCell>{log.action}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                    <TableCell colSpan={3} className="text-center">No email logs found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
