
'use client';

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
  SidebarTrigger,
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
  Mail,
  CheckSquare,
  ChevronDown,
} from 'lucide-react';
import { Separator } from '../ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useLoading } from '@/hooks/useLoading';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/tenants', icon: Users, label: 'Tenants' },
  { href: '/tenants/archived', icon: Archive, label: 'Archived Tenants' },
  { href: '/documents', icon: FileText, label: 'My Documents' },
  { href: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { href: '/water-meter/add', icon: Droplets, label: 'Add Water Reading' },
  { href: '/properties', icon: Building2, label: 'Properties' },
];

const otherItems = [
  { href: '/clients', icon: Briefcase, label: 'Client Properties' },
  { href: '/landlords', icon: Users, label: 'Landlords' },
  { href: '/airbnb', icon: BedDouble, label: 'Airbnb Monitoring' },
  { href: '/communications', icon: Mail, label: 'Communications' },
]

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { user, userProfile } = useAuth();
  const { startLoading } = useLoading();
  const [isAccountingOpen, setIsAccountingOpen] = useState(pathname.startsWith('/accounts') || pathname.startsWith('/tasks'));

  const isActive = (href: string) => pathname === href;

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleLinkClick = (label: string) => {
    startLoading(`Loading ${label}...`);
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-3 p-2">
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
            {(state === 'expanded' || isMobile) && <h1 className="text-xl font-semibold">Eracov Properties</h1>}
          </div>
          {(state === 'expanded' || isMobile) && <SidebarTrigger />}
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-1">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} onClick={() => handleLinkClick(item.label)}>
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

          <SidebarMenuItem>
            <Collapsible open={isAccountingOpen} onOpenChange={setIsAccountingOpen}>
              <CollapsibleTrigger asChild className="w-full">
                  <SidebarMenuButton isActive={pathname.startsWith('/accounts') || pathname.startsWith('/tasks')}>
                    <Banknote />
                    <span>Accounts</span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
                  </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="pl-8 py-1 space-y-1">
                  <SidebarMenuItem>
                    <Link href="/accounts" onClick={() => handleLinkClick('Accounts')}>
                      <SidebarMenuButton isActive={isActive('/accounts')} size="sm">
                        <span>Overview</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Link href="/tasks" onClick={() => handleLinkClick('Tasks')}>
                      <SidebarMenuButton isActive={isActive('/tasks')} size="sm">
                        <CheckSquare />
                        <span>Tasks</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>


          <Separator className="my-2" />
          {otherItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} onClick={() => handleLinkClick(item.label)}>
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
          {(userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com') && (
            <SidebarMenuItem>
              <Link href="/logs" onClick={() => handleLinkClick('Activity Logs')}>
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
          {userProfile?.role === 'homeowner' && (
            <SidebarMenuItem>
              <Link href="/homeowner-dashboard" onClick={() => handleLinkClick('Homeowner Dashboard')}>
                <SidebarMenuButton
                  isActive={isActive('/homeowner-dashboard')}
                  tooltip="Homeowner Dashboard"
                >
                  <LayoutDashboard />
                  <span>Homeowner Dashboard</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>

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
