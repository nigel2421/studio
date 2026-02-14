

import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { cacheService } from './cache';
import {
    Property, Unit, WaterMeterReading, Payment, Tenant,
    ArchivedTenant, MaintenanceRequest, UserProfile, Log, Landlord,
    UserRole, UnitStatus, PropertyOwner, FinancialDocument, ServiceChargeStatement, Communication, Task, UnitType,
    unitStatuses, ownershipTypes, unitTypes, managementStatuses, handoverStatuses, UnitOrientation, unitOrientations, Agent,
    OwnershipType,
    ManagementStatus,
    HandoverStatus,
    Lease,
    MaintenanceStatus
} from './types';
import { db, firebaseConfig, sendPaymentReceipt } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, arrayUnion, writeBatch, orderBy, deleteDoc, limit, onSnapshot, runTransaction, collectionGroup, deleteField, startAfter, DocumentReference, DocumentSnapshot, Query, documentId } from 'firebase/firestore';
import { auth } from './firebase';
import { reconcileMonthlyBilling, processPayment, validatePayment, getRecommendedPaymentStatus, generateLedger } from './financial-logic';
import { format, startOfMonth, addMonths, parseISO } from "date-fns";

const WATER_RATE = 150; // Ksh per unit

function postToJSON<T>(doc: DocumentSnapshot): T {
    const data = doc.data();
    if (!data) {
        return { id: doc.id } as T;
    }
    
    // This is a generic way to convert all Firestore Timestamps in an object to ISO strings.
    const convertObjectTimestamps = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        // Firestore Timestamps have a toDate method
        if (typeof obj.toDate === 'function') {
            return obj.toDate().toISOString();
        }

        // If it's an array, recursively convert its elements
        if (Array.isArray(obj)) {
            return obj.map(convertObjectTimestamps);
        }
        
        // If it's an object, recursively convert its properties
        const newObj: { [key: string]: any } = {};
        for (const key of Object.keys(obj)) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = convertObjectTimestamps(obj[key]);
            }
        }
        
        return newObj;
    };
    
    const serializedData = convertObjectTimestamps(data);

    return { id: doc.id, ...serializedData } as T;
}


export async function logActivity(action: string, userEmail?: string | null) {
    const user = auth.currentUser;
    // Don't log if user isn't authenticated, unless an email is passed (for server-side logging)
    if (!user && !userEmail) return;

    try {
        await addDoc(collection(db, 'logs'), {
            userId: user?.uid || 'system',
            userEmail: user?.email || userEmail || 'system',
            action,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}


export async function logCommunication(data: Omit<Communication, 'id'>) {
    try {
        await addDoc(collection(db, 'communications'), {
            ...data,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error logging communication:", error);
    }
}

async function getAllUsers(): Promise<UserProfile[]> {
    return cacheService.getOrFetch('users', 'all', () => getCollection<UserProfile>('users'), 300000);
}

export async function getUsers(
    options: {
        searchQuery?: string;
        roleFilters?: UserRole[];
        page?: number;
        pageSize?: number;
    } = {}
): Promise<{ users: UserProfile[]; totalCount: number }> {
    // This function is complex because roles like 'landlord' and 'homeowner' are not stored
    // directly on the user object. They are determined dynamically by checking other collections.
    // This makes pure server-side filtering and pagination difficult without a data model change.

    // STRATEGY:
    // 1. Fetch auxiliary data (properties, landlords, owners) once. These calls are cached by the cacheService.
    // 2. Perform server-side pagination on the 'users' collection itself if no complex filters are applied.
    // 3. Perform the expensive role-derivation and filtering logic on the full dataset in memory,
    //    but rely on the underlying caching to make this fast after the first load.
    // 4. Paginate the final result before returning. This combination prevents database timeouts
    //    and provides a responsive UI.

    const { searchQuery = '', roleFilters = [], page = 1, pageSize = 10 } = options;

    // Step 1: Get all auxiliary data (these calls are cached for 5 minutes)
    const [allUsers, properties, landlords, propertyOwners] = await Promise.all([
        getAllUsers(),
        getProperties(),
        getLandlords(),
        getPropertyOwners(),
    ]);

    // Step 2: Derive dynamic roles for all users (in memory, but uses cached data)
    const investorIds = new Set<string>();
    const clientIds = new Set<string>();
    const allCombinedOwners: (Landlord | PropertyOwner)[] = [...landlords, ...propertyOwners];
    
    // Create a map of units for efficient lookup
    const allUnitsMap = new Map<string, Unit>();
    properties.forEach(p => {
        (p.units || []).forEach(u => allUnitsMap.set(`${p.id}-${u.name}`, u));
    });

    const ownerUnitsMap = new Map<string, Unit[]>();
    allCombinedOwners.forEach(owner => {
        const units: Unit[] = [];
        if ('assignedUnits' in owner) { // PropertyOwner
            (owner as PropertyOwner).assignedUnits.forEach(au => {
                au.unitNames.forEach(unitName => {
                    const unit = allUnitsMap.get(`${au.propertyId}-${unitName}`);
                    if (unit) units.push(unit);
                });
            });
        }
        properties.forEach(p => {
            (p.units || []).forEach(u => {
                if (u.landlordId === owner.id) units.push(u);
            });
        });
        ownerUnitsMap.set(owner.id, [...new Map(units.map(u => [u.name, u])).values()]);
    });

    for (const owner of allCombinedOwners) {
        const unitsOfOwner = ownerUnitsMap.get(owner.id) || [];
        if (unitsOfOwner.length === 0) continue;

        const isInvestor = unitsOfOwner.some(u => u.managementStatus === 'Rented for Clients' || u.managementStatus === 'Rented for Soil Merchants' || u.managementStatus === 'Airbnb');
        const isClient = unitsOfOwner.some(u => u.managementStatus === 'Client Managed');

        if (isClient && !isInvestor) clientIds.add(owner.id);
        else if (isInvestor) investorIds.add(owner.id);
    }

    const allUsersWithDynamicRoles = allUsers.map(user => {
        const ownerId = user.landlordId || user.propertyOwnerId;
        if (ownerId) {
            if (clientIds.has(ownerId)) return { ...user, role: 'homeowner' as UserRole };
            if (investorIds.has(ownerId)) return { ...user, role: 'landlord' as UserRole };
        }
        return user;
    });

    // Step 3: Filter the full list in memory
    let filteredUsers = allUsersWithDynamicRoles;
    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filteredUsers = filteredUsers.filter(user =>
            (user.name && user.name.toLowerCase().includes(lowercasedQuery)) ||
            user.email.toLowerCase().includes(lowercasedQuery)
        );
    }
    if (roleFilters.length > 0) {
        filteredUsers = filteredUsers.filter(user => roleFilters.includes(user.role));
    }

    // Step 4: Paginate the final, filtered list
    const totalCount = filteredUsers.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedUsers = filteredUsers.slice(start, end);

    return { users: paginatedUsers, totalCount };
}


export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) throw new Error("User not found.");
        const userEmail = userSnap.data().email;

        await updateDoc(userRef, { role });
        cacheService.clear('users');
        await logActivity(`Updated role for user ${userEmail} to ${role}`);
    } catch (error: any) {
        console.error(`Error updating role for user ${userId}:`, error);
        if (error.code === 'permission-denied') {
            throw new Error("You do not have permission to update user roles.");
        }
        throw new Error("A database error occurred while updating the user role.");
    }
}

export async function getLogs(): Promise<Log[]> {
    return cacheService.getOrFetch('logs', 'all', () => {
        const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(1000));
        return getCollection<Log>(q);
    }, 120000);
}


async function getCollection<T>(collectionOrQuery: string | Query, queryConstraints: any[] = []): Promise<T[]> {
    let q: Query;
    if (typeof collectionOrQuery === 'string') {
        q = query(collection(db, collectionOrQuery), ...queryConstraints);
    } else {
        q = collectionOrQuery;
    }
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => postToJSON<T>(doc));
}


export async function getPaginatedCollection<T>(
    collectionName: string,
    options: { pageSize: number; lastDocId?: string; sortField?: string; sortOrder?: 'asc' | 'desc'; filters?: any[] }
): Promise<{ items: T[]; lastDocId: string | null }> {
    const constraints: any[] = [...(options.filters || [])];

    if (options.sortField) {
        constraints.push(orderBy(options.sortField, options.sortOrder || 'desc'));
    }

    if (options.lastDocId) {
        const lastDocRef = doc(db, collectionName, options.lastDocId);
        const lastDocSnap = await getDoc(lastDocRef);
        if (lastDocSnap.exists()) {
            constraints.push(startAfter(lastDocSnap));
        }
    }

    constraints.push(limit(options.pageSize));

    const q = query(collection(db, collectionName), ...constraints);
    const querySnapshot = await getDocs(q);

    const items = querySnapshot.docs.map(doc => postToJSON<T>(doc));
    const lastDocId = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1].id : null;

    return { items, lastDocId };
}

async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return postToJSON<T>(docSnap);
    } else {
        return null;
    }
}

export async function getProperties(forceRefresh = false): Promise<Property[]> {
    if (forceRefresh) {
        cacheService.clear('properties');
    }

    return cacheService.getOrFetch('properties', 'all', async () => {
        const properties = await getCollection<Property>('properties');

        const desiredOrder = [
            'Midtown Apartments',
            'Grand Midtown Apartments',
            'Grand Midtown Annex Apartments',
        ];

        return properties.sort((a, b) => {
            const indexA = desiredOrder.indexOf(a.name);
            const indexB = desiredOrder.indexOf(b.name);

            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
            }
            if (indexA !== -1) {
                return -1;
            }
            if (indexB !== -1) {
                return 1;
            }
            return a.name.localeCompare(b.name);
        });
    }, 300000); // 5 minutes cache
}

export async function getTenants(options: { propertyId?: string; limit?: number } = {}): Promise<Tenant[]> {
    const { propertyId, limit: limitCount } = options;
    const cacheKey = propertyId ? `prop-${propertyId}` : (limitCount ? `limit-${limitCount}` : 'all');
    
    // Reduce cache time for more dynamic filtered queries
    const ttl = propertyId ? 60000 : 300000;

    return cacheService.getOrFetch('tenants', cacheKey, () => {
        const constraints: any[] = [];
        if (propertyId) {
            constraints.push(where("propertyId", "==", propertyId));
        }
        if (limitCount) {
            constraints.push(limit(limitCount));
        }
        return getCollection<Tenant>('tenants', constraints);
    }, ttl);
}

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    return cacheService.getOrFetch('archived_tenants', 'all', () => getCollection<ArchivedTenant>('archived_tenants'), 300000);
}

export async function getMaintenanceRequests(options: { propertyId?: string } = {}): Promise<MaintenanceRequest[]> {
    const { propertyId } = options;
    const cacheKey = propertyId ? `prop-${propertyId}-last90` : 'all';
    
    return cacheService.getOrFetch('maintenanceRequests', cacheKey, async () => {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const constraints: any[] = [
            orderBy('createdAt', 'desc')
        ];

        if (propertyId) {
            constraints.unshift(where('propertyId', '==', propertyId));
        }

        const q = query(
            collection(db, 'maintenanceRequests'),
            ...constraints
        );
        return getCollection<MaintenanceRequest>(q);
    }, 120000);
}

export async function getAllMaintenanceRequestsForReport(): Promise<MaintenanceRequest[]> {
    return cacheService.getOrFetch('maintenanceRequests', 'all-report', () => {
        const q = query(collection(db, 'maintenanceRequests'), orderBy('createdAt', 'desc'));
        return getCollection<MaintenanceRequest>(q);
    }, 300000);
}


export async function getProperty(id: string): Promise<Property | null> {
    return cacheService.getOrFetch('properties', id, () => getDocument<Property>('properties', id), 60000);
}


export async function getTenantWaterReadings(tenantId: string): Promise<WaterMeterReading[]> {
    if (!tenantId) return [];
    return cacheService.getOrFetch('waterReadings', `tenant-${tenantId}`, () => {
        const readingsQuery = query(
            collection(db, 'waterReadings'),
            where('tenantId', '==', tenantId),
            orderBy('createdAt', 'desc')
        );
        return getCollection<WaterMeterReading>(readingsQuery);
    }, 120000);
}

export async function getWaterReadingsAndTenants(readingIds: string[]): Promise<{reading: WaterMeterReading, tenant: Tenant | null}[]> {
    if (readingIds.length === 0) return [];
    
    const readingsQuery = query(collection(db, 'waterReadings'), where(documentId(), 'in', readingIds));
    const readingsSnap = await getDocs(readingsQuery);
    const readings = readingsSnap.docs.map(doc => postToJSON<WaterMeterReading>(doc));

    const tenantIds = [...new Set(readings.map(r => r.tenantId))];
    
    if (tenantIds.length === 0) {
        return readings.map(reading => ({ reading, tenant: null }));
    }

    const tenantsQuery = query(collection(db, 'tenants'), where(documentId(), 'in', tenantIds));
    const tenantsSnap = await getDocs(tenantsQuery);
    const tenantsMap = new Map(tenantsSnap.docs.map(doc => [doc.id, postToJSON<Tenant>(doc)]));

    return readings.map(reading => ({
        reading,
        tenant: tenantsMap.get(reading.tenantId) || null,
    }));
}

export async function getAllWaterReadings(): Promise<WaterMeterReading[]> {
    return cacheService.getOrFetch('waterReadings', 'all', async () => {
        const q = query(collectionGroup(db, 'waterReadings'), orderBy('date', 'desc'));
        return getCollection<WaterMeterReading>(q);
    }, 120000); // 2 min cache
}

export async function getLatestWaterReading(propertyId: string, unitName: string): Promise<WaterMeterReading | null> {
    const q = query(
        collection(db, 'waterReadings'),
        where('propertyId', '==', propertyId),
        where('unitName', '==', unitName),
        orderBy('date', 'desc'),
        limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        return null;
    }
    return postToJSON<WaterMeterReading>(querySnapshot.docs[0]);
}

export async function getTenant(id: string): Promise<Tenant | null> {
    return cacheService.getOrFetch('tenants', id, () => getDocument<Tenant>('tenants', id), 60000);
}

export async function getPayment(id: string): Promise<Payment | null> {
    return cacheService.getOrFetch('payments', id, () => getDocument<Payment>('payments', id), 60000);
}

export async function addTenant(data: {
    name: string;
    email: string;
    phone: string;
    idNumber: string;
    propertyId: string;
    unitName: string;
    agent: Agent;
    rent: number;
    securityDeposit: number;
    waterDeposit?: number;
    residentType: 'Tenant' | 'Homeowner';
    leaseStartDate: string;
}): Promise<void> {

    const { name, email, phone, idNumber, propertyId, unitName, agent, rent, securityDeposit, waterDeposit, leaseStartDate, residentType } = data;

    if (rent <= 0 && residentType === 'Tenant') {
        throw new Error("Monthly Rent must be a positive value for tenants.");
    }

    const property = await getProperty(propertyId);
    if (!property) {
        throw new Error("Cannot add tenant: selected property not found.");
    }
    const unit = property.units.find(u => u.name === unitName);
    if (!unit) {
        throw new Error("Cannot add tenant: selected unit not found in property.");
    }

    const initialDue = rent + (securityDeposit || 0) + (waterDeposit || 0);

    let lastBilledPeriod: string;
    if (residentType === 'Homeowner' && unit.handoverDate) {
        const handoverDate = new Date(unit.handoverDate);
        const handoverDay = handoverDate.getDate();

        let firstBillableMonth: Date;
        if (handoverDay <= 10) {
            // Handover before/on 10th waives that month, billing starts next month.
            firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
        } else {
            // Handover after 10th waives next month, billing starts month after.
            firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
        }
        // Last billed period is the month *before* the first billable one. This is correct as initial due is 0.
        lastBilledPeriod = format(addMonths(firstBillableMonth, -1), 'yyyy-MM');
    } else {
        // For Tenants: Since we include the first month's rent in initialDue, we set
        // lastBilledPeriod to the month of the lease start. This prevents the reconciliation
        // logic from double-billing the first month.
        lastBilledPeriod = format(new Date(leaseStartDate), 'yyyy-MM');
    }


    const newTenantData = {
        name,
        email,
        phone,
        idNumber,
        propertyId,
        unitName,
        agent,
        status: 'active' as const,
        residentType: residentType,
        lease: {
            startDate: leaseStartDate,
            endDate: new Date(new Date(leaseStartDate).setFullYear(new Date(leaseStartDate).getFullYear() + 1)).toISOString().split('T')[0],
            rent: rent,
            serviceCharge: unit.serviceCharge || 0,
            paymentStatus: 'Pending' as const,
            lastBilledPeriod: lastBilledPeriod,
        },
        securityDeposit: securityDeposit || 0,
        waterDeposit: waterDeposit || 0,
        dueBalance: initialDue,
        accountBalance: 0,
    };
    const tenantDocRef = await addDoc(collection(db, 'tenants'), newTenantData);

    const totalInitialCharges = initialDue;
    const taskDescription = `Complete onboarding for ${name} in ${unitName}. An initial balance of Ksh ${totalInitialCharges.toLocaleString()} is pending. (Rent: ${rent}, Sec. Deposit: ${securityDeposit || 0}, Water Deposit: ${waterDeposit || 0})`;

    // Parallelize task creation, logging, and property update
    const independentOperations = [
        addTask({
            title: `Onboard: ${name}`,
            description: taskDescription,
            status: 'Pending',
            priority: 'High',
            category: 'Financial',
            tenantId: tenantDocRef.id,
            propertyId,
            unitName,
            dueDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
        }),
        logActivity(`Created tenant: ${name} (${email})`),
        updateProperty(propertyId, {
            units: property.units.map(u =>
                u.name === unitName ? { ...u, status: 'rented' as UnitStatus } : u
            )
        }),
        logActivity(`Updated unit ${unitName} in property ${property.name} to 'rented'`)
    ];

    // Auth user creation logic
    const createAuthUser = async () => {
        const appName = 'tenant-auth-worker';
        let secondaryApp;
        try {
            secondaryApp = getApp(appName);
        } catch (e) {
            secondaryApp = initializeApp(firebaseConfig, appName);
        }

        const secondaryAuth = getAuth(secondaryApp);
        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, phone);
            const user = userCredential.user;

            await createUserProfile(user.uid, user.email || email, 'tenant', {
                name: name,
                tenantId: tenantDocRef.id,
                propertyId: propertyId
            });
        } finally {
            // Note: In high-concurrency server-side environments, 
            // constant deleteApp/initializeApp can be a bottleneck.
            // We keep the app alive as a worker app for auth operations.
        }
    };

    // Run everything in parallel
    await Promise.all([...independentOperations, createAuthUser()]);
    cacheService.clear('tenants');
    cacheService.clear('tasks');
}

export async function addProperty(property: Omit<Property, 'id' | 'imageId'>): Promise<void> {
    const newPropertyData = {
        ...property,
        imageId: `property-${Math.floor(Math.random() * 3) + 1}`,
    };

    await addDoc(collection(db, "properties"), newPropertyData);
    cacheService.clear('properties');
    await logActivity(`Added new property: ${property.name}`);
}

export async function updateProperty(propertyId: string, data: Partial<Property>): Promise<void> {
    const propertyRef = doc(db, 'properties', propertyId);
    await updateDoc(propertyRef, data);
    cacheService.clear('properties'); // Invalidate cache on update
    await logActivity(`Updated property: ID ${propertyId}`);
}

export async function archiveTenant(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (tenant) {
        const tenantRef = doc(db, 'tenants', tenantId);
        const archivedTenantRef = doc(db, 'archived_tenants', tenantId);

        const batch = writeBatch(db);
        batch.set(archivedTenantRef, { ...tenant, archivedAt: new Date().toISOString(), status: 'archived' });
        batch.delete(tenantRef);
        await batch.commit();

        const propertyRef = doc(db, 'properties', tenant.propertyId);
        const propertySnap = await getDoc(propertyRef);
        if (propertySnap.exists()) {
            const propertyData = propertySnap.data() as Property;
            const updatedUnits = propertyData.units.map(u =>
                u.name === tenant.unitName ? { ...u, status: 'vacant' } : u
            );
            await updateDoc(propertyRef, { units: updatedUnits });
        }

        cacheService.clear('tenants');
        cacheService.clear('archived_tenants');
        await logActivity(`Archived resident: ${tenant.name}`);
    }
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    const oldTenant = await getTenant(tenantId);
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, tenantData);
    cacheService.clear('tenants');

    await logActivity(`Updated tenant: ${tenantData.name || oldTenant?.name}`);

    if (oldTenant && (oldTenant.propertyId !== tenantData.propertyId || oldTenant.unitName !== tenantData.unitName)) {
        // Mark old unit as vacant
        const oldPropRef = doc(db, 'properties', oldTenant.propertyId);
        const oldPropSnap = await getDoc(oldPropRef);
        if (oldPropSnap.exists()) {
            const oldPropData = oldPropSnap.data() as Property;
            const updatedOldUnits = oldPropData.units.map(u =>
                u.name === oldTenant.unitName ? { ...u, status: 'vacant' } : u
            );
            await updateDoc(oldPropRef, { units: updatedOldUnits });
        }

        // Mark new unit as rented
        if (tenantData.propertyId && tenantData.unitName) {
            const newPropRef = doc(db, 'properties', tenantData.propertyId);
            const newPropSnap = await getDoc(newPropRef);
            if (newPropSnap.exists()) {
                const newPropData = newPropSnap.data() as Property;
                const updatedNewUnits = newPropData.units.map(u =>
                    u.name === tenantData.unitName ? { ...u, status: 'rented' } : u
                );
                await updateDoc(newPropRef, { units: updatedNewUnits });
            }
        }
    }
}

export async function createUserProfile(userId: string, email: string, role: UserProfile['role'], details: Partial<UserProfile> = {}) {
    const userProfileRef = doc(db, 'users', userId);
    await setDoc(userProfileRef, {
        email,
        role,
        ...details,
    }, { merge: true });
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    return cacheService.getOrFetch('userProfiles', userId, async () => {
        const userProfileRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userProfileRef);
        if (docSnap.exists()) {
            const userProfile = postToJSON<UserProfile>(docSnap);

            if ((userProfile.role === 'tenant' || userProfile.role === 'homeowner') && userProfile.tenantId) {
                const tenantDetails = await getTenant(userProfile.tenantId);
                userProfile.tenantDetails = tenantDetails ?? undefined;
            }
            return userProfile;
        }
        return null;
    }, 60000);
}


export async function addMaintenanceRequest(request: Omit<MaintenanceRequest, 'id' | 'date' | 'createdAt' | 'updatedAt' | 'status'>) {
    try {
        const now = new Date().toISOString();
        await addDoc(collection(db, 'maintenanceRequests'), {
            ...request,
            date: now,
            createdAt: now,
            updatedAt: now,
            status: 'New',
        });
        cacheService.clear('maintenanceRequests');
        await logActivity(`Submitted maintenance request: "${request.title}"`);
    } catch (error: any) {
        console.error("Error adding maintenance request:", error);
        throw new Error("Failed to submit maintenance request. Please try again later.");
    }
}

export async function updateMaintenanceRequestStatus(requestId: string, status: MaintenanceStatus) {
    try {
        const requestRef = doc(db, 'maintenanceRequests', requestId);
        const updateData: { status: MaintenanceStatus, updatedAt: string, completedAt?: string } = {
            status,
            updatedAt: new Date().toISOString()
        };
        if (status === 'Completed' || status === 'Cancelled') {
            updateData.completedAt = new Date().toISOString();
        }
        await updateDoc(requestRef, updateData);

        cacheService.clear('maintenanceRequests');
        await logActivity(`Updated maintenance request ${requestId} to ${status}`);
    } catch (error: any) {
        console.error(`Error updating maintenance request ${requestId}:`, error);
        if (error.code === 'permission-denied') {
            throw new Error("You do not have permission to update maintenance requests.");
        }
        throw new Error("A database error occurred while updating the request status.");
    }
}

export async function getTenantMaintenanceRequests(tenantId: string): Promise<MaintenanceRequest[]> {
    return cacheService.getOrFetch('maintenanceRequests', `tenant-${tenantId}`, () => {
        const q = query(
            collection(db, "maintenanceRequests"),
            where("tenantId", "==", tenantId),
            orderBy('createdAt', 'desc')
        );
        return getCollection<MaintenanceRequest>(q);
    }, 120000);
}


export async function addWaterMeterReading(data: {
    propertyId: string;
    unitName: string;
    priorReading: number;
    currentReading: number;
    date: string;
}, asOfDate?: Date) {
    const { propertyId, unitName, currentReading, date } = data;

    const property = await getProperty(propertyId);
    if (!property) {
        throw new Error("Property not found.");
    }
    const unit = property.units.find(u => u.name === unitName);
    if (!unit) {
        throw new Error("Unit not found in property.");
    }

    // Step 1: Find or create a tenant record for this unit
    let tenantForReading: Tenant | null = null;
    const tenantsSnapshot = await getDocs(query(collection(db, 'tenants'), where('propertyId', '==', propertyId), where('unitName', '==', unitName), limit(1)));
    
    if (!tenantsSnapshot.empty) {
        tenantForReading = { id: tenantsSnapshot.docs[0].id, ...tenantsSnapshot.docs[0].data() } as Tenant;
    } else {
        // If no tenant, it might be a client-managed unit. Find the owner.
        const allOwners = await getPropertyOwners();
        const allLandlords = await getLandlords();
        
        let owner: PropertyOwner | Landlord | undefined;

        const foundOwner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === propertyId && au.unitNames.includes(unitName)));
        if(foundOwner) {
            owner = foundOwner;
        }

        if (!owner && unit.landlordId) {
            owner = allLandlords.find(l => l.id === unit.landlordId);
        }

        if (owner) {
            const ownerAsPropertyOwner: PropertyOwner = {
                id: owner.id,
                name: owner.name,
                email: owner.email,
                phone: owner.phone,
                userId: owner.userId,
                bankAccount: 'bankAccount' in owner ? owner.bankAccount : undefined,
                assignedUnits: 'assignedUnits' in owner ? owner.assignedUnits : [],
            };
            tenantForReading = await findOrCreateHomeownerTenant(ownerAsPropertyOwner, unit, propertyId);
        }
    }

    if (!tenantForReading) {
        throw new Error(`Could not find or create a resident record for unit ${unitName} to bill.`);
    }
    
    const originalTenant = tenantForReading;

    const consumption = currentReading - data.priorReading;
    const amount = consumption * WATER_RATE;

    // 2. Record the water reading
    await addDoc(collection(db, 'waterReadings'), {
        ...data,
        tenantId: originalTenant.id,
        consumption,
        rate: WATER_RATE,
        amount,
        createdAt: serverTimestamp(),
        status: 'Pending',
    });
    cacheService.clear('waterReadings');

    // 3. Run reconciliation on the current tenant state to update rent, but DO NOT add the water bill to the balance.
    const reconciliationUpdates = reconcileMonthlyBilling(tenantForReading, unit, asOfDate || new Date());

    // 4. Update tenant in Firestore if there are any rent reconciliation updates
    if (Object.keys(reconciliationUpdates).length > 0) {
        const tenantRef = doc(db, 'tenants', originalTenant.id);
        await updateDoc(tenantRef, reconciliationUpdates);
        cacheService.clear('tenants');
    }

    await logActivity(`Added water reading for unit ${data.unitName}`);
}

export async function getPaymentHistory(tenantId: string, options?: { startDate?: string, endDate?: string }): Promise<Payment[]> {
    const cacheKey = `paymentHistory-${tenantId}-${options?.startDate || 'none'}-${options?.endDate || 'none'}`;
    return cacheService.getOrFetch('payments', cacheKey, () => {
        const constraints = [where("tenantId", "==", tenantId)];
        if (options?.startDate) {
            constraints.push(where("date", ">=", options.startDate));
        }
        if (options?.endDate) {
            constraints.push(where("date", "<=", options.endDate));
        }

        const q = query(
            collection(db, "payments"),
            ...constraints,
            orderBy('date', 'desc')
        );
        return getCollection<Payment>(q);
    }, 120000);
}

export async function getTenantPayments(tenantId: string): Promise<Payment[]> {
    if (!tenantId) return [];
    return getPaymentHistory(tenantId);
}

export async function getPaymentsForTenants(tenantIds: string[]): Promise<Payment[]> {
    if (tenantIds.length === 0) {
        return [];
    }
    const cacheKey = `tenants-payments-${tenantIds.slice(0, 5).join('-')}`; // simple cache key
    return cacheService.getOrFetch('payments', cacheKey, async () => {
        const paymentChunks: Payment[][] = [];
        // Firestore 'in' query is limited to 30 items per query
        for (let i = 0; i < tenantIds.length; i += 30) {
            const chunk = tenantIds.slice(i, i + 30);
            const q = query(collection(db, 'payments'), where('tenantId', 'in', chunk));
            const payments = await getCollection<Payment>(q);
            paymentChunks.push(payments);
        }
        return paymentChunks.flat();
    }, 60000);
}

export async function getPropertyWaterReadings(propertyId: string): Promise<WaterMeterReading[]> {
    return cacheService.getOrFetch('waterReadings', `property-${propertyId}`, async () => {
        const property = await getProperty(propertyId);
        if (!property) return [];
        const unitNames = (property.units || []).map(u => u.name);

        const chunks = [];
        for (let i = 0; i < unitNames.length; i += 30) {
            chunks.push(unitNames.slice(i, i + 30));
        }

        const fetchPromises = chunks.map(chunk => {
            const q = query(
                collection(db, 'waterReadings'),
                where('propertyId', '==', propertyId),
                where('unitName', 'in', chunk),
                orderBy('date', 'desc')
            );
            return getDocs(q);
        });

        const snapshots = await Promise.all(fetchPromises);
        return snapshots.flatMap(snapshot =>
            snapshot.docs.map(doc => postToJSON<WaterMeterReading>(doc))
        );
    }, 120000);
}

export async function getPropertyMaintenanceRequests(propertyId: string): Promise<MaintenanceRequest[]> {
    const q = query(
        collection(db, 'maintenanceRequests'),
        where('propertyId', '==', propertyId),
        orderBy('createdAt', 'desc')
    );
    return getCollection<MaintenanceRequest>(q);
}

export async function batchProcessPayments(
    tenantId: string,
    paymentEntries: {
        amount: number,
        date: string,
        notes?: string,
        rentForMonth?: string,
        type: Payment['type'],
        paymentMethod?: Payment['paymentMethod'],
        transactionId?: string,
        waterReadingId?: string,
    }[],
    taskId?: string
) {
    const tenantRef = doc(db, 'tenants', tenantId);

    // Fetch property data outside the transaction as it's read-only for this operation
    const tempTenant = await getTenant(tenantId);
    if (!tempTenant) throw new Error("Tenant not found before transaction.");
    const property = await getProperty(tempTenant.propertyId);
    const unit = property?.units.find(u => u.name === tempTenant.unitName);

    await runTransaction(db, async (transaction) => {
        // 1. Transactional read of the tenant document
        const tenantSnap = await transaction.get(tenantRef);
        if (!tenantSnap.exists()) {
            throw new Error("Tenant not found during transaction");
        }

        let workingTenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;

        // 2. Perform reconciliation in memory to get up-to-date rent balance
        const reconciliationUpdates = reconcileMonthlyBilling(workingTenant, unit, new Date());

        // 3. Apply reconciliation updates to the in-memory tenant object
        if (reconciliationUpdates.dueBalance !== undefined) workingTenant.dueBalance = reconciliationUpdates.dueBalance;
        if (reconciliationUpdates.accountBalance !== undefined) workingTenant.accountBalance = reconciliationUpdates.accountBalance;
        if (reconciliationUpdates['lease.paymentStatus']) workingTenant.lease.paymentStatus = reconciliationUpdates['lease.paymentStatus'];
        if (reconciliationUpdates['lease.lastBilledPeriod']) workingTenant.lease.lastBilledPeriod = reconciliationUpdates['lease.lastBilledPeriod'];

        // `workingTenant` is now the most up-to-date state before processing new payments.

        for (const entry of paymentEntries) {
            validatePayment(entry.amount, new Date(entry.date), workingTenant, entry.type);
        }

        // 4. Process all new payments against the in-memory state
        for (const entry of paymentEntries) {
            const paymentDocRef = doc(collection(db, 'payments'));
            const paymentPayload: Partial<Payment> = {
                tenantId,
                amount: entry.amount,
                date: entry.date,
                notes: entry.notes,
                rentForMonth: entry.rentForMonth,
                type: entry.type,
                status: 'Paid',
                paymentMethod: entry.paymentMethod,
                transactionId: entry.transactionId,
                createdAt: new Date().toISOString(),
            };

            if (entry.type === 'Water' && entry.waterReadingId) {
                paymentPayload.waterReadingId = entry.waterReadingId;
                const readingRef = doc(db, 'waterReadings', entry.waterReadingId);
                transaction.update(readingRef, { status: 'Paid', paymentId: paymentDocRef.id });
            }
            
            transaction.set(paymentDocRef, paymentPayload);

            // ONLY apply rent/deposit/etc payments to the main tenant balance
            if (entry.type !== 'Water') {
                const paymentProcessingUpdates = processPayment(workingTenant, entry.amount, entry.type, new Date(entry.date));

                workingTenant = {
                    ...workingTenant,
                    dueBalance: paymentProcessingUpdates.dueBalance,
                    accountBalance: paymentProcessingUpdates.accountBalance,
                    lease: {
                        ...workingTenant.lease,
                        paymentStatus: paymentProcessingUpdates['lease.paymentStatus'],
                        lastPaymentDate: paymentProcessingUpdates['lease.lastPaymentDate'] || workingTenant.lease.lastPaymentDate,
                    }
                };
            }
        }

        // 5. Prepare the final, combined updates for the tenant document
        const finalUpdates: { [key: string]: any } = {
            dueBalance: workingTenant.dueBalance,
            accountBalance: workingTenant.accountBalance,
            'lease.paymentStatus': workingTenant.lease.paymentStatus,
        };

        if (workingTenant.lease.lastBilledPeriod) {
            finalUpdates['lease.lastBilledPeriod'] = workingTenant.lease.lastBilledPeriod;
        }
        if (workingTenant.lease.lastPaymentDate) {
            finalUpdates['lease.lastPaymentDate'] = workingTenant.lease.lastPaymentDate;
        }

        // 6. Perform the single final write to the tenant document
        transaction.update(tenantRef, finalUpdates);
    });

    if (taskId) {
        try {
            const taskRef = doc(db, 'tasks', taskId);
            await updateDoc(taskRef, { status: 'Completed' });
            await logActivity(`Completed task ${taskId} via payment.`);
        } catch (error) {
            console.error("Failed to update task status:", error);
        }
    }

    cacheService.clear('tenants');
    cacheService.clear('payments');
    if (paymentEntries.some(e => e.type === 'Water')) {
        cacheService.clear('waterReadings');
    }

    const tenant = await getTenant(tenantId);
    if (tenant) {
        const property = await getProperty(tenant.propertyId);
        for (const entry of paymentEntries) {
            if (entry.type !== 'Adjustment') {
                try {
                    await sendPaymentReceipt({
                        tenantId: tenant.id,
                        tenantEmail: tenant.email,
                        tenantName: tenant.name,
                        amount: entry.amount,
                        date: entry.date,
                        propertyName: property?.name || 'N/A',
                        unitName: tenant.unitName,
                        notes: entry.notes,
                        paymentMethod: entry.paymentMethod,
                        transactionId: entry.transactionId,
                    });
                    await logActivity(`Sent payment receipt to ${tenant.name} (${tenant.email})`);
                } catch (error) {
                    console.error("Failed to send receipt email:", error);
                }
            }
        }
    }
}


export async function addPayment(paymentData: Omit<Payment, 'id' | 'createdAt'>, taskId?: string): Promise<void> {
    const { tenantId, amount, date, notes, rentForMonth, type } = paymentData;
    const entries = [{
        amount,
        date,
        notes,
        rentForMonth,
        type,
        paymentMethod: paymentData.paymentMethod,
        transactionId: paymentData.transactionId,
    }];
    await batchProcessPayments(tenantId, entries, taskId);
}

export async function updatePayment(
    paymentId: string,
    updates: { amount: number; date: string; notes?: string },
    reason: string,
    editorId: string
) {
    const paymentRef = doc(db, 'payments', paymentId);

    await runTransaction(db, async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        if (!paymentSnap.exists()) {
            throw new Error("Payment to edit not found.");
        }
        const oldPayment = paymentSnap.data() as Payment;

        const historyEntry = {
            editedAt: new Date().toISOString(),
            editedBy: editorId,
            reason: reason,
            previousValues: {
                amount: oldPayment.amount,
                date: oldPayment.date,
                notes: oldPayment.notes,
            },
        };

        const newEditHistory = [...(oldPayment.editHistory || []), historyEntry];

        transaction.update(paymentRef, {
            ...updates,
            editHistory: newEditHistory
        });
    });

    cacheService.clear('payments');
    await logActivity(`Edited payment ${paymentId}. Reason: ${reason}`);
}

export async function forceRecalculateTenantBalance(tenantId: string) {
    const tenant = await getTenant(tenantId);
    if (!tenant) {
        console.error("Tenant not found for recalculation.");
        return;
    }

    const allPayments = await getPaymentHistory(tenantId);
    const allTenantWaterReadings = await getTenantWaterReadings(tenantId);
    const allProperties = await getProperties();

    const { finalDueBalance, finalAccountBalance } = generateLedger(tenant, allPayments, allProperties, allTenantWaterReadings);

    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
        dueBalance: finalDueBalance,
        accountBalance: finalAccountBalance,
        'lease.paymentStatus': getRecommendedPaymentStatus({ dueBalance: finalDueBalance })
    });
    cacheService.clear('tenants');
}

export async function runMonthlyReconciliation(): Promise<void> {
    const tenantsRef = collection(db, 'tenants');
    const tenantsSnap = await getDocs(tenantsRef);
    const today = new Date();

    const allProperties = await getProperties();
    const propertiesMap = new Map(allProperties.map(p => [p.id, p]));

    const batch = writeBatch(db);

    for (const tenantDoc of tenantsSnap.docs) {
        const tenant = { id: tenantDoc.id, ...tenantDoc.data() } as Tenant;
        const property = propertiesMap.get(tenant.propertyId);
        const unit = property?.units.find(u => u.name === tenant.unitName);
        const updates = reconcileMonthlyBilling(tenant, unit, today);

        if (updates && Object.keys(updates).length > 0) {
            batch.update(tenantDoc.ref, updates);
        }
    }

    await batch.commit();
    cacheService.clear('tenants');
    await logActivity(`Monthly reconciliation completed for ${tenantsSnap.size} tenants.`);
}

export async function bulkUpdateUnitsFromCSV(
    propertyId: string,
    data: Record<string, string>[]
): Promise<{ updatedCount: number; createdCount: number; errors: string[] }> {
    const errors: string[] = [];
    let updatedCount = 0;
    let createdCount = 0;

    const property = await getProperty(propertyId);
    if (!property) {
        return { updatedCount: 0, createdCount: 0, errors: [`Property with ID "${propertyId}" not found.`] };
    }

    const unitsMap = new Map(property.units.map(u => [u.name, u]));
    const updatedUnits = [...property.units];

    for (const [index, row] of data.entries()) {
        const { UnitName, Status, Ownership, UnitType, UnitOrientation, ManagementStatus, HandoverStatus, HandoverDate, RentAmount, ServiceCharge, BaselineReading } = row;

        if (!UnitName) {
            continue;
        }

        let unitData: Partial<Unit> = {};

        if (Status !== undefined && Status.trim() !== '') {
            if (!unitStatuses.includes(Status as any)) { errors.push(`Row ${index + 2}: Invalid Status "${Status}".`); continue; }
            unitData.status = Status as UnitStatus;
        }
        if (Ownership !== undefined && Ownership.trim() !== '') {
            if (!ownershipTypes.includes(Ownership as any)) { errors.push(`Row ${index + 2}: Invalid Ownership "${Ownership}".`); continue; }
            unitData.ownership = Ownership as OwnershipType;
        }
        if (UnitType !== undefined && UnitType.trim() !== '') {
            if (!unitTypes.includes(UnitType as any)) { errors.push(`Row ${index + 2}: Invalid UnitType "${UnitType}".`); continue; }
            unitData.unitType = UnitType as UnitType;
        }
        if (UnitOrientation !== undefined && UnitOrientation.trim() !== '') {
            if (!unitOrientations.includes(UnitOrientation as any)) { errors.push(`Row ${index + 2}: Invalid UnitOrientation "${UnitOrientation}".`); continue; }
            unitData.unitOrientation = UnitOrientation as UnitOrientation;
        }
        if (ManagementStatus !== undefined && ManagementStatus.trim() !== '') {
            if (!managementStatuses.includes(ManagementStatus as any)) { errors.push(`Row ${index + 2}: Invalid ManagementStatus "${ManagementStatus}".`); continue; }
            unitData.managementStatus = ManagementStatus as ManagementStatus;
        }
        if (HandoverStatus !== undefined && HandoverStatus.trim() !== '') {
            if (!handoverStatuses.includes(HandoverStatus as any)) { errors.push(`Row ${index + 2}: Invalid HandoverStatus "${HandoverStatus}".`); continue; }
            unitData.handoverStatus = HandoverStatus as HandoverStatus;
            if (HandoverStatus === 'Handed Over' && !HandoverDate && (!unitsMap.has(UnitName) || !unitsMap.get(UnitName)!.handoverDate)) {
                unitData.handoverDate = new Date().toISOString().split('T')[0];
            }
        }
        if (HandoverDate !== undefined && HandoverDate.trim() !== '') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(HandoverDate)) { errors.push(`Row ${index + 2}: Invalid HandoverDate format "${HandoverDate}". Use YYYY-MM-DD.`); continue; }
            unitData.handoverDate = HandoverDate;
        }
        if (RentAmount !== undefined && RentAmount.trim() !== '') {
            const rent = Number(RentAmount);
            if (isNaN(rent) || rent < 0) { errors.push(`Row ${index + 2}: Invalid RentAmount "${RentAmount}".`); continue; }
            unitData.rentAmount = rent;
        }
        if (ServiceCharge !== undefined && ServiceCharge.trim() !== '') {
            const charge = Number(ServiceCharge);
            if (isNaN(charge) || charge < 0) { errors.push(`Row ${index + 2}: Invalid ServiceCharge "${ServiceCharge}".`); continue; }
            unitData.serviceCharge = charge;
        }
        if (BaselineReading !== undefined && BaselineReading.trim() !== '') {
            const reading = Number(BaselineReading);
            if (isNaN(reading) || reading < 0) { errors.push(`Row ${index + 2}: Invalid BaselineReading "${BaselineReading}".`); continue; }
            unitData.baselineReading = reading;
        }

        const unitIndex = updatedUnits.findIndex(u => u.name === UnitName);
        if (unitIndex !== -1) {
            updatedUnits[unitIndex] = { ...updatedUnits[unitIndex], ...unitData };
            updatedCount++;
        } else {
            const newUnit: Unit = {
                name: UnitName,
                status: (unitData.status || 'vacant') as UnitStatus,
                ownership: (unitData.ownership || 'SM') as OwnershipType,
                unitType: (unitData.unitType || 'Studio') as UnitType,
                ...unitData,
            };
            updatedUnits.push(newUnit);
            createdCount++;
        }
    }

    if (errors.length > 0) {
        return { updatedCount: 0, createdCount: 0, errors };
    }

    if (updatedCount > 0 || createdCount > 0) {
        await updateProperty(propertyId, { units: updatedUnits });
        await logActivity(`Bulk processed ${updatedCount} updates and ${createdCount} creations for property ${property.name} via CSV.`);
    }

    return { updatedCount, createdCount, errors: [] };
}
