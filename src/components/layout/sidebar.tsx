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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Wrench,
  Building2,
  Briefcase,
  BedDouble,
  LogOut,
  Banknote,
  Droplets,
  History,
  Mail,
  ChevronDown,
  UserCog,
  ClipboardList,
  AlertCircle,
} from 'lucide-react';
import { Separator } from '../ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useLoading } from '@/hooks/useLoading';
import React, { useEffect } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/accounts', icon: Banknote, label: 'Accounts' },
  { href: '/accounts/arrears', icon: AlertCircle, label: 'Arrears' },
  { href: '/accounts/service-charges', icon: ClipboardList, label: 'Service Charges' },
  { href: '/tenants', icon: Users, label: 'Tenants' },
  { href: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { href: '/water-meter/add', icon: Droplets, label: 'Megarack' },
  { href: '/properties', icon: Building2, label: 'Properties' },
];

const otherItems = [
  { href: '/clients', icon: Briefcase, label: 'Client Self Managed Units' },
  { href: '/landlords', icon: Users, label: 'Landlords' },
  { href: '/airbnb', icon: BedDouble, label: 'Airbnb' },
  { href: '/communications', icon: Mail, label: 'Communications' },
]

export function AppSidebar() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { user, userProfile } = useAuth();
  const { startLoading } = useLoading();

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';
  const isAgent = userProfile?.role === 'agent';
  const isInvestmentConsultant = userProfile?.role === 'investment-consultant';

  const isActive = (href: string) => pathname === href;

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleLinkClick = (label: string) => {
    startLoading(`Loading ${label}...`);
  }
  
  const visibleNavItems = navItems.filter(item => {
    if (item.href === '/tenants/archived') return false;
    if (isAgent) {
        const agentHidden = ['/accounts', '/accounts/arrears', '/accounts/service-charges'];
        if (agentHidden.includes(item.href)) return false;
    }
    if (isInvestmentConsultant) {
        const allowedRoutes = ['/dashboard', '/properties', '/tenants'];
        if (!allowedRoutes.includes(item.href)) return false;
    }
    return true;
  });

  const visibleOtherItems = otherItems.filter(item => {
      if (isInvestmentConsultant) {
          const allowedRoutes = ['/clients', '/landlords'];
          if (!allowedRoutes.includes(item.href)) return false;
      }
      return true;
  });


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
          {visibleNavItems.map((item) => {
            if (item.href === '/tenants') {
                 if (isInvestmentConsultant && !['/dashboard', '/properties', '/tenants'].includes(item.href)) {
                    return null;
                 }
                 return (
                    <Collapsible asChild key="tenants-group" defaultOpen={pathname ? pathname.startsWith('/tenants') : false}>
                        <SidebarMenuItem>
                            <CollapsibleTrigger className="w-full">
                                <SidebarMenuButton isActive={pathname ? pathname.startsWith('/tenants') : false}>
                                    <Users />
                                    <span>Tenants</span>
                                    <ChevronDown className="ml-auto h-4 w-4 transition-transform data-[state=open]:rotate-180" />
                                </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <SidebarMenuSub>
                                    <SidebarMenuSubItem>
                                        <Link href="/tenants" onClick={() => handleLinkClick('All Residents')}>
                                            <SidebarMenuSubButton isActive={pathname === '/tenants'}>All Residents</SidebarMenuSubButton>
                                        </Link>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                        <Link href="/tenants/notice-to-vacate" onClick={() => handleLinkClick('Notice to Vacate')}>
                                            <SidebarMenuSubButton isActive={pathname === '/tenants/notice-to-vacate'}>Notice to Vacate</SidebarMenuSubButton>
                                        </Link>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                        <Link href="/tenants/archived" onClick={() => handleLinkClick('Archived Tenants')}>
                                            <SidebarMenuSubButton isActive={pathname === '/tenants/archived'}>Archived</SidebarMenuSubButton>
                                        </Link>
                                    </SidebarMenuSubItem>
                                </SidebarMenuSub>
                            </CollapsibleContent>
                        </SidebarMenuItem>
                    </Collapsible>
                 );
            }

            return (
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
            )
          })}


          <Separator className="my-2" />
          
          {visibleOtherItems.map((item) => (
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
          
          {isAdmin && (
            <>
              <SidebarMenuItem>
                <Link href="/users" onClick={() => handleLinkClick('User Management')}>
                  <SidebarMenuButton
                    isActive={isActive('/users')}
                    tooltip="User Management"
                  >
                    <UserCog />
                    <span>User Management</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
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
            </>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <Separator className="mb-2" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Avatar className="h-8 w-8">
                <AvatarFallback>{userProfile?.name?.[0] || user?.email?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-semibold">{userProfile?.name || user?.email}</span>
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
