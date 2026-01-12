
'use client';

import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  Building2,
  FolderArchive,
  Briefcase,
  BedDouble,
  LogOut,
  Archive,
  Banknote,
  Droplets,
  History,
} from 'lucide-react';
import { Separator } from '../ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/tenants', icon: Users, label: 'Tenants' },
  { href: '/tenants/archived', icon: Archive, label: 'Archived Tenants'},
  { href: '/leases', icon: FileText, label: 'Lease Tracking' },
  { href: '/accounts', icon: Banknote, label: 'Accounts'},
  { href: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { href: '/water-meter/add', icon: Droplets, label: 'Add Water Reading' },
  { href: '/properties', icon: Building2, label: 'Properties' },
];

const otherItems = [
    { href: '/documents', icon: FolderArchive, label: 'Documents' },
    { href: '/clients', icon: Briefcase, label: 'Client Properties' },
    { href: '/airbnb', icon: BedDouble, label: 'Airbnb Monitoring' },
]

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const { user, userProfile } = useAuth();

  const isActive = (href: string) => pathname === href;

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <svg
            className="text-primary"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
          </svg>
          {state === 'expanded' && <h1 className="text-xl font-semibold">Eracov Properties</h1>}
        </div>
      </SidebarHeader>

      <SidebarMenu>
        {navItems.map((item) => (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href}>
              <SidebarMenuButton
                isActive={isActive(item.href)}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
         <Separator className="my-2" />
         {otherItems.map((item) => (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href}>
              <SidebarMenuButton
                isActive={isActive(item.href)}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>

      <SidebarFooter>
        <Separator className="mb-2" />
        <SidebarMenu>
          <SidebarMenuItem>
             <SidebarMenuButton>
              <Avatar className="h-8 w-8">
                 <AvatarFallback>{user?.email?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-semibold">{user?.email}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
           {userProfile?.role === 'admin' && (
             <SidebarMenuItem>
               <Link href="/logs">
                 <SidebarMenuButton
                   isActive={isActive('/logs')}
                   tooltip="Activity Logs"
                 >
                   <History />
                   <span>Activity Logs</span>
                 </SidebarMenuButton>
               </Link>
             </SidebarMenuItem>
           )}
           <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
