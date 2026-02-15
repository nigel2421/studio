'use client';

import { useEffect, useState } from 'react';
import { getCommunications, getUserProfile, getProperties, getTenants, logActivity, getLandlords, getPropertyOwners } from '@/lib/data';
import type { Log, UserProfile, Property, Tenant, Landlord, PropertyOwner, Communication } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PlusCircle, Send, Users, Building, Mail, Eye, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/hooks/useLoading';
import { performSendCustomEmail, performCheckLeaseReminders } from '@/app/actions';

export default function CommunicationsPage() {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const { user, userProfile, isLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { startLoading, stopLoading } = useLoading();

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedComm, setSelectedComm] = useState<Communication | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'landlords' | 'owners' | string>('all');

  const templates = [
    { name: 'Rent Reminder', subject: 'Reminder: Rent Payment Due', body: 'Dear Resident,\n\nThis is a friendly reminder that your rent payment for the current period is now due. Please ensure payment is made at your earliest convenience to avoid any late fees.\n\nThank you for choosing Eracov Properties.' },
    { name: 'Arrears Notice', subject: 'Urgent: Outstanding Balance for [Month]', body: 'Dear [Resident Name],\n\nThis is a notification regarding an outstanding balance on your account for the period of [Month].\n\n- Amount Due for [Month]: Ksh [Amount]\n- Previous Arrears: Ksh [Previous Balance]\n\n**Total Overdue Balance: Ksh [Total Overdue]**\n\nPlease settle the outstanding amount immediately to avoid further action.\n\nIf you have already made this payment, please disregard this notice and contact our office with the payment details.\n\nRegards,\nEracov Management' },
    { name: 'Maintenance Notice', subject: 'Important: Scheduled Maintenance Works', body: 'Dear Residents,\n\nPlease be advised that we have scheduled maintenance works for your development on [Date]. During this time, there may be temporary disruptions to [Service]. We apologize for any inconvenience caused.' },
    { name: 'New Policy Update', subject: 'Update: New Building Policies', body: 'Dear Residents,\n\nWe are writing to inform you of some updates to our building policies effective [Date]. These changes are intended to improve the living experience for everyone. Please find the details below:\n\n[Details Here]' },
    { name: 'Holiday Greeting', subject: 'Season\'s Greetings from Eracov Management', body: 'Dear Residents,\n\nAs we approach the holiday season, the team at Eracov Properties would like to wish you and your family a wonderful time filled with joy and peace.\n\nHappy Holidays!' },
    { name: 'Invoice Notification', subject: 'New Invoice Available', body: 'Dear Resident,\n\nA new invoice has been generated for your account. You can view and download the PDF receipt directly from your tenant portal under the "My Documents" section.\n\nThank you.' },
  ];

  const fetchData = async () => {
    const comms = await getCommunications();
    setCommunications(comms.sort((a: Communication, b: Communication) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

    const userIds = [...new Set(comms.map((c: Communication) => c.senderId))].filter((id): id is string => !!id);
    const userPromises = userIds.map(id => getUserProfile(id));
    const userResults = await Promise.all(userPromises);

    const userMap = new Map<string, UserProfile>();
    userResults.forEach((user: UserProfile | null) => {
      if (user) {
        userMap.set(user.id, user);
      }
    });
    setUsers(userMap);

    const props = await getProperties();
    setProperties(props);

    const allTenants = await getTenants();
    setTenants(allTenants);
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    fetchData();
  }, []);

  const handleTemplateSelect = (templateName: string) => {
    const template = templates.find(t => t.name === templateName);
    if (template) {
      setSubject(template.subject);
      setMessage(template.body);
    }
  };

  const handleSendMessage = async () => {
    if (!subject || !message || !user) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please provide a subject, message, and be logged in.' });
      return;
    }

    let recipientEmails: string[] = [];

    if (recipientFilter === 'all') {
      recipientEmails = [...new Set(tenants.map(t => t.email).filter(Boolean))];
    } else if (recipientFilter === 'landlords') {
      const landlords = await getLandlords();
      recipientEmails = [...new Set(landlords.map(l => l.email).filter(Boolean))];
    } else if (recipientFilter === 'owners') {
      const owners = await getPropertyOwners();
      recipientEmails = [...new Set(owners.map(o => o.email).filter(Boolean))];
    } else {
      // It's a specific property ID
      recipientEmails = [...new Set(tenants.filter(t => t.propertyId === recipientFilter).map(t => t.email).filter(Boolean))];
    }

    if (recipientEmails.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'No recipients found for the selected filter.' });
      return;
    }

    startLoading(`Sending message to ${recipientEmails.length} recipients...`);
    try {
      const result = await performSendCustomEmail(recipientEmails, subject, message, user.uid);
      if (result.success) {
        toast({ title: 'Success', description: `Message sent to ${recipientEmails.length} recipients.` });
        setIsComposeOpen(false);
        setSubject('');
        setMessage('');
        fetchData();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to send message.' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
    } finally {
      stopLoading();
    }
  };

  const handleRunAutomation = async () => {
    startLoading('Checking leases and sending reminders...');
    try {
      const result = await performCheckLeaseReminders();
      if (result.success) {
        toast({ title: 'Automation Complete', description: (result.data as any).message });
        fetchData();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to run automation.' });
    } finally {
      stopLoading();
    }
  };

  const insertFormatting = (tag: string) => {
    const textarea = document.getElementById('message-body') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const selection = text.substring(start, end);

    let newText = '';
    if (tag === 'bold') newText = `${before}**${selection}**${after}`;
    if (tag === 'italic') newText = `${before}_${selection}_${after}`;
    if (tag === 'list') newText = `${before}\n- ${selection}${after}`;

    setMessage(newText);
    textarea.focus();
  };

  const getUserEmail = (userId: string) => {
    if (userId === 'system') return 'System Automation';
    return users.get(userId)?.email || 'Unknown User';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Communication Center</h2>
          <p className="text-muted-foreground">Manage announcements, templates, and delivery history.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRunAutomation} className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800">
            <Zap className="mr-2 h-4 w-4" />
            Run Automation
          </Button>
          <Button onClick={() => setIsComposeOpen(true)} className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95">
            <PlusCircle className="mr-2 h-4 w-4" />
            Compose Message
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-3 border-primary/10 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Message History</CardTitle>
                <CardDescription>Archive of all sent communications.</CardDescription>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px] pl-6">Date & Time</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Subject / Type</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead className="pr-6 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {communications.length > 0 ? communications.map((comm) => (
                  <TableRow key={comm.id} className="group transition-colors">
                    <TableCell className="text-xs text-muted-foreground pl-6">
                      {new Date(comm.timestamp).toLocaleDateString()} · {new Date(comm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${comm.senderId === 'system' ? 'bg-blue-100 text-blue-600' : 'bg-primary/10 text-primary'
                          }`}>
                          {comm.senderId === 'system' ? 'AI' : getUserEmail(comm.senderId)[0]?.toUpperCase()}
                        </div>
                        {getUserEmail(comm.senderId)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[200px]">{comm.subject}</span>
                        <span className="text-[10px] text-muted-foreground capitalize">{comm.type} {comm.subType ? `· ${comm.subType}` : ''}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                        {comm.recipientCount} Recipients
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedComm(comm); setIsViewOpen(true); }}>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 text-muted-foreground italic">
                      <Mail className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No communication records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-amber-500/10 shadow-sm">
            <CardHeader className="bg-amber-500/5 pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-amber-600">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex gap-3 text-xs leading-relaxed group">
                <div className="h-5 w-5 shrink-0 rounded bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Building className="h-3 w-3" />
                </div>
                <p><strong>Property Segmentation</strong>: Deliver building-specific news only to affected residents.</p>
              </div>
              <div className="flex gap-3 text-xs leading-relaxed group">
                <div className="h-5 w-5 shrink-0 rounded bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Users className="h-3 w-3" />
                </div>
                <p><strong>Role Targeting</strong>: Blast messages to all Landlords or Owners with one click.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">System Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Gateway</span>
                <span className="flex items-center gap-1.5 font-bold text-green-600">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  SMTP Live
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Delivery Rate</span>
                <span className="font-bold">100.0%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden border-primary/20">
          {/* Compose Dialog Content - Same as before */}
          <DialogHeader className="p-6 bg-muted/30 border-b">
            <DialogTitle className="text-2xl font-bold">New Communication</DialogTitle>
            <DialogDescription>
              Draft and deliver professional announcements to your network.
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-[1fr_200px] gap-0">
            <div className="p-6 space-y-6 border-r">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="recipient" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Select Recipient Layer</Label>
                  <Select value={recipientFilter} onValueChange={setRecipientFilter}>
                    <SelectTrigger className="h-11 bg-muted/30">
                      <SelectValue placeholder="Select recipients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Entire Portfolio (All Tenants)</SelectItem>
                      <SelectItem value="landlords" className="text-blue-600 font-medium">All Registered Landlords</SelectItem>
                      <SelectItem value="owners" className="text-amber-600 font-medium">All Property Owners (Clients)</SelectItem>
                      <div className="h-px bg-muted my-1" />
                      <div className="px-2 py-1.5 text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">By Specific Property</div>
                      {properties.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="subject" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Subject Line</Label>
                  <Input
                    id="subject"
                    placeholder="Enter message subject..."
                    className="h-11 bg-muted/30 border-transparent focus:border-primary/50"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="message" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Message Content</Label>
                    <div className="flex gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7 text-xs font-bold" onClick={() => insertFormatting('bold')}>B</Button>
                      <Button variant="outline" size="icon" className="h-7 w-7 text-xs italic" onClick={() => insertFormatting('italic')}>I</Button>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => insertFormatting('list')}>Li</Button>
                    </div>
                  </div>
                  <Textarea
                    id="message-body"
                    placeholder="Compose your message here..."
                    className="min-h-[250px] bg-muted/30 border-transparent focus:border-primary/50 leading-relaxed"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground italic">Markdown-style formatting (**, _) is supported for emphasis.</p>
                </div>
              </div>
            </div>

            <div className="bg-muted/10 p-4 space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 flex items-center gap-2">
                <PlusCircle className="h-3 w-3" />
                Templates
              </h4>
              <div className="space-y-2">
                {templates.map(t => (
                  <button
                    key={t.name}
                    onClick={() => handleTemplateSelect(t.name)}
                    className="w-full text-left p-2.5 text-xs rounded-lg border bg-white hover:border-primary hover:text-primary transition-all shadow-sm active:scale-95 flex flex-col gap-0.5"
                  >
                    <span className="font-bold">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">{t.subject}</span>
                  </button>
                ))}
              </div>
              <div className="pt-4 mt-4 border-t border-dashed">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Templates automatically populate the subject and body to save you time.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 bg-muted/30 border-t sm:justify-between items-center">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              SMTP System Ready
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setIsComposeOpen(false)} className="h-11 px-6">Cancel</Button>
              <Button onClick={handleSendMessage} disabled={!subject || !message} className="h-11 px-8 shadow-lg shadow-primary/20">
                <Send className="mr-2 h-4 w-4" />
                Deliver Message
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                {selectedComm?.type === 'automation' ? <Zap className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </div>
              <div>
                <DialogTitle>{selectedComm?.subject}</DialogTitle>
                <DialogDescription>
                  Sent by {selectedComm ? getUserEmail(selectedComm.senderId) : '...'} on {selectedComm ? new Date(selectedComm.timestamp).toLocaleDateString() : '...'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6 bg-slate-50">
            {selectedComm && (
              <div className="bg-white rounded-lg border shadow-sm p-8 max-w-[600px] mx-auto min-h-[400px]">
                <div dangerouslySetInnerHTML={{ __html: selectedComm.body }} />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/20">
            <Button onClick={() => setIsViewOpen(false)}>Close Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
