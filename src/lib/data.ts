
import { initializeApp, getApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { cacheService } from './cache';
import {
    Property, Unit, WaterMeterReading, Payment, Tenant,
    ArchivedTenant, MaintenanceRequest, UserProfile, Log, Landlord,
    UserRole, UnitStatus, PropertyOwner, FinancialDocument, ServiceChargeStatement, Communication, Task, UnitType,
    unitStatuses, ownershipTypes, unitTypes, managementStatuses, handoverStatuses, UnitOrientation, unitOrientations, Agent,
    NoticeToVacate,
    MaintenanceStatus,
    MaintenanceUpdate
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

    const convertObjectTimestamps = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (typeof obj.toDate === 'function') {
            return obj.toDate().toISOString();
        }

        if (Array.isArray(obj)) {
            return obj.map(convertObjectTimestamps);
        }

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

async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return postToJSON<T>(docSnap);
    } else {
        return null;
    }
}
async function getAllUsers(): Promise<UserProfile[]> {
    return cacheService.getOrFetch('users', 'all', () => getCollection<UserProfile>('users'), 300000);
}
export async function getProperties(forceRefresh = false): Promise<Property[]> {
    if (forceRefresh) {
        cacheService.clear('properties');
    }

    return cacheService.getOrFetch('properties', 'all', async () => {
        const properties = await getCollection<Property>('properties');
        const desiredOrder = ['Midtown Apartments', 'Grand Midtown Apartments', 'Grand Midtown Annex Apartments'];
        return properties.sort((a, b) => {
            const indexA = desiredOrder.indexOf(a.name);
            const indexB = desiredOrder.indexOf(b.name);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.name.localeCompare(b.name);
        });
    }, 300000);
}

export async function getLandlords(): Promise<Landlord[]> {
    return cacheService.getOrFetch('landlords', 'all', () => getCollection<Landlord>('landlords'), 300000);
}

export async function getPropertyOwners(): Promise<PropertyOwner[]> {
    return cacheService.getOrFetch('propertyOwners', 'all', () => getCollection<PropertyOwner>('propertyOwners'), 300000);
}


export async function getUsers(
    options: {
        searchQuery?: string;
        roleFilters?: UserRole[];
        page?: number;
        pageSize?: number;
    } = {}
): Promise<{ users: UserProfile[]; totalCount: number }> {
    const { searchQuery = '', roleFilters = [], page = 1, pageSize = 10 } = options;

    const [allUsers, properties, landlords, propertyOwners] = await Promise.all([
        getAllUsers(),
        getProperties(),
        getLandlords(),
        getPropertyOwners(),
    ]);

    const investorIds = new Set<string>();
    const clientIds = new Set<string>();
    const allCombinedOwners: (Landlord | PropertyOwner)[] = [...landlords, ...propertyOwners];

    const allUnitsMap = new Map<string, Unit>();
    properties.forEach(p => {
        (p.units || []).forEach(u => allUnitsMap.set(`${p.id}-${u.name}`, u));
    });

    const ownerUnitsMap = new Map<string, Unit[]>();
    allCombinedOwners.forEach(owner => {
        const units: Unit[] = [];
        if ('assignedUnits' in owner) { 
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


export async function getTenants(options: { propertyId?: string; limit?: number } = {}): Promise<Tenant[]> {
    const { propertyId, limit: limitCount } = options;
    const cacheKey = propertyId ? `prop-${propertyId}` : (limitCount ? `limit-${limitCount}` : 'all');

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

export async function getCommunications(): Promise<Communication[]> {
    return getCollection<Communication>(query(collection(db, 'communications'), orderBy('timestamp', 'desc'), limit(50)));
}


export async function getMaintenanceRequests(options: { propertyId?: string } = {}): Promise<MaintenanceRequest[]> {
    const { propertyId } = options;
    const cacheKey = propertyId ? `prop-${propertyId}-last90` : 'all';

    return cacheService.getOrFetch('maintenanceRequests', cacheKey, async () => {
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
    }, 60000);
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

export async function getWaterReadingsAndTenants(readingIds: string[]): Promise<{ reading: WaterMeterReading, tenant: Tenant | null }[]> {
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
    }, 120000); 
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

export async function getAllPaymentsForReport(): Promise<Payment[]> {
    return cacheService.getOrFetch('payments', 'all-report', () => {
        const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
        return getCollection<Payment>(q);
    }, 300000);
}

export async function findOrCreateHomeownerTenant(owner: PropertyOwner, unit: Unit, propertyId: string): Promise<Tenant> {
    const tenantsRef = collection(db, 'tenants');
    const q = query(
        tenantsRef,
        where("propertyId", "==", propertyId),
        where("unitName", "==", unit.name),
        where("residentType", "==", "Homeowner"),
        limit(1)
    );
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        return { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as Tenant;
    }

    const serviceCharge = unit.serviceCharge || 0;
    const handoverDate = unit?.handoverDate ? new Date(unit.handoverDate) : new Date();
    const handoverDay = handoverDate.getDate();

    let lastBilledPeriod: string;
    let firstBillableMonth: Date;

    if (handoverDay <= 10) {
        firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
    } else {
        firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
    }
    lastBilledPeriod = format(addMonths(firstBillableMonth, -1), 'yyyy-MM');


    const newTenantData = {
        name: owner.name,
        email: owner.email,
        phone: owner.phone,
        idNumber: 'N/A',
        propertyId: propertyId,
        unitName: unit.name,
        agent: 'Susan' as const,
        status: 'active' as const,
        residentType: 'Homeowner' as const,
        lease: {
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 99)).toISOString().split('T')[0],
            rent: 0,
            serviceCharge: serviceCharge,
            paymentStatus: 'Paid' as const, 
            lastBilledPeriod: lastBilledPeriod, 
        },
        securityDeposit: 0,
        waterDeposit: 0,
        dueBalance: 0, 
        accountBalance: 0,
        userId: owner.userId,
    };

    const tenantDocRef = await addDoc(tenantsRef, newTenantData);
    cacheService.clear('tenants');
    await logActivity(`Auto-created homeowner resident account for ${owner.name} for unit ${unit.name}`);

    if (owner.userId) {
        const userRef = doc(db, 'users', owner.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && !userSnap.data().tenantId) {
            await updateDoc(userRef, { tenantId: tenantDocRef.id });
            cacheService.clear('users');
        }
    }

    return { id: tenantDocRef.id, ...newTenantData } as Tenant;
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
            firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
        } else {
            firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
        }
        lastBilledPeriod = format(addMonths(firstBillableMonth, -1), 'yyyy-MM');
    } else {
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
        }
    };

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
    cacheService.clear('properties');
    await logActivity(`Updated property: ID ${propertyId}`);
}

export async function addOrUpdateLandlord(landlord: Landlord, assignedUnitNames: string[]): Promise<void> {
    const landlordRef = doc(db, 'landlords', landlord.id);
    await setDoc(landlordRef, landlord, { merge: true });

    const propertiesToUpdate = new Map<string, Unit[]>();

    const allProperties = await getProperties(true);
    allProperties.forEach(p => {
        let changed = false;
        const newUnits = p.units.map(u => {
            if (u.ownership === 'Landlord') {
                const shouldBeAssigned = assignedUnitNames.includes(u.name);
                if (shouldBeAssigned && u.landlordId !== landlord.id) {
                    changed = true;
                    return { ...u, landlordId: landlord.id };
                }
                if (!shouldBeAssigned && u.landlordId === landlord.id) {
                    changed = true;
                    const { landlordId: _, ...rest } = u;
                    return rest;
                }
            }
            return u;
        });
        if (changed) {
            propertiesToUpdate.set(p.id, newUnits);
        }
    });

    const batch = writeBatch(db);
    propertiesToUpdate.forEach((units, propId) => {
        batch.update(doc(db, 'properties', propId), { units });
    });

    await batch.commit();

    cacheService.clear('properties');
    cacheService.clear('landlords');
    await logActivity(`Saved landlord: ${landlord.name}`);
}


export async function addLandlordsFromCSV(landlords: { name: string; email: string; phone: string }[]): Promise<{ added: number; skipped: number }> {
    const existingLandlords = await getLandlords();
    const existingEmails = new Set(existingLandlords.map(l => l.email.toLowerCase()));
    let added = 0;
    let skipped = 0;
    const batch = writeBatch(db);

    for (const landlord of landlords) {
        if (landlord.email && !existingEmails.has(landlord.email.toLowerCase())) {
            const landlordId = `landlord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const landlordRef = doc(db, 'landlords', landlordId);
            batch.set(landlordRef, { ...landlord, id: landlordId });
            added++;
            existingEmails.add(landlord.email.toLowerCase());
        } else {
            skipped++;
        }
    }

    await batch.commit();
    if (added > 0) {
        cacheService.clear('landlords');
        await logActivity(`Bulk-added ${added} new landlords via CSV.`);
    }
    return { added, skipped };
}

export async function bulkUpdateUnitsFromCSV(propertyId: string, csvData: Record<string, string>[]): Promise<{ updatedCount: number; createdCount: number; errors: string[] }> {
    const property = await getProperty(propertyId);
    if (!property) {
        throw new Error("Property not found.");
    }
    const currentUnitsMap = new Map(property.units.map(u => [u.name.toLowerCase(), u]));
    let updatedCount = 0;
    let createdCount = 0;
    const errors: string[] = [];
    const newUnitsArray: Unit[] = [...property.units];

    csvData.forEach((row, index) => {
        const unitName = row.UnitName;
        if (!unitName) {
            errors.push(`Row ${index + 2}: Missing required 'UnitName'.`);
            return;
        }

        const existingUnit = currentUnitsMap.get(unitName.toLowerCase());

        const unitData: Partial<Unit> = {};

        if (row.Status && (unitStatuses as readonly string[]).includes(row.Status)) unitData.status = row.Status as UnitStatus;
        if (row.Ownership && (ownershipTypes as readonly string[]).includes(row.Ownership)) unitData.ownership = row.Ownership as OwnershipType;
        if (row.UnitType && (unitTypes as readonly string[]).includes(row.UnitType)) unitData.unitType = row.UnitType as UnitType;
        if (row.UnitOrientation && (unitOrientations as readonly string[]).includes(row.UnitOrientation)) unitData.unitOrientation = row.UnitOrientation as UnitOrientation;
        if (row.ManagementStatus && (managementStatuses as readonly string[]).includes(row.ManagementStatus)) unitData.managementStatus = row.ManagementStatus as ManagementStatus;
        if (row.HandoverStatus && (handoverStatuses as readonly string[]).includes(row.HandoverStatus)) unitData.handoverStatus = row.HandoverStatus as HandoverStatus;
        if (row.HandoverDate) unitData.handoverDate = row.HandoverDate;
        if (row.RentAmount) unitData.rentAmount = Number(row.RentAmount);
        if (row.ServiceCharge) unitData.serviceCharge = Number(row.ServiceCharge);
        if (row.BaselineReading) unitData.baselineReading = Number(row.BaselineReading);


        if (existingUnit) { 
            const unitIndex = newUnitsArray.findIndex(u => u.name.toLowerCase() === unitName.toLowerCase());
            if (unitIndex !== -1) {
                newUnitsArray[unitIndex] = { ...newUnitsArray[unitIndex], ...unitData };
                updatedCount++;
            }
        } else { 
            if (!row.UnitType) {
                errors.push(`Row ${index + 2}: New unit '${unitName}' requires 'UnitType'.`);
                return;
            }
            newUnitsArray.push({
                name: unitName,
                unitType: row.UnitType as UnitType,
                status: (row.Status as UnitStatus) || 'vacant',
                ownership: (row.Ownership as OwnershipType) || 'SM',
                ...unitData
            });
            createdCount++;
        }
    });

    if (updatedCount > 0 || createdCount > 0) {
        await updateProperty(propertyId, { units: newUnitsArray });
        await logActivity(`CSV Upload for ${property.name}: ${createdCount} created, ${updatedCount} updated.`);
    }

    return { updatedCount, createdCount, errors };
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
                u.name === tenant.unitName ? { ...u, status: 'vacant' as UnitStatus } : u
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
        const oldPropRef = doc(db, 'properties', oldTenant.propertyId);
        const oldPropSnap = await getDoc(oldPropRef);
        if (oldPropSnap.exists()) {
            const oldPropData = oldPropSnap.data() as Property;
            const updatedOldUnits = oldPropData.units.map(u =>
                u.name === oldTenant.unitName ? { ...u, status: 'vacant' as UnitStatus } : u
            );
            await updateDoc(oldPropRef, { units: updatedOldUnits });
        }

        if (tenantData.propertyId && tenantData.unitName) {
            const newPropRef = doc(db, 'properties', tenantData.propertyId);
            const newPropSnap = await getDoc(newPropRef);
            if (newPropSnap.exists()) {
                const newPropData = newPropSnap.data() as Property;
                const updatedNewUnits = newPropData.units.map(u =>
                    u.name === tenantData.unitName ? { ...u, status: 'rented' as UnitStatus } : u
                );
                await updateDoc(newPropRef, { units: updatedNewUnits });
            }
        }
    }
}

export async function updatePropertyOwner(ownerId: string, data: Partial<PropertyOwner>): Promise<void> {
    const ownerRef = doc(db, 'propertyOwners', ownerId);
    await updateDoc(ownerRef, data);
    cacheService.clear('propertyOwners');
    await logActivity(`Updated property owner: ${data.name || ownerId}`);
}

export async function deletePropertyOwner(ownerId: string): Promise<void> {
    const ownerRef = doc(db, 'propertyOwners', ownerId);
    const ownerSnap = await getDoc(ownerRef);
    if (ownerSnap.exists()) {
        const ownerData = ownerSnap.data() as PropertyOwner;
        const batch = writeBatch(db);
        batch.delete(ownerRef);

        if (ownerData.userId) {
            const userRef = doc(db, 'users', ownerData.userId);
            batch.update(userRef, {
                role: 'viewer',
                propertyOwnerId: deleteField()
            });
        }
        await batch.commit();

        cacheService.clear('propertyOwners');
        cacheService.clear('users');
        await logActivity(`Deleted property owner: ${ownerData.name}`);
    }
}


export async function deleteLandlord(landlordId: string): Promise<void> {
    if (landlordId === 'soil_merchants_internal') {
        throw new Error("Cannot delete the internal Soil Merchants profile.");
    }
    const landlordRef = doc(db, 'landlords', landlordId);
    const landlordSnap = await getDoc(landlordRef);
    if (!landlordSnap.exists()) {
        throw new Error("Landlord not found.");
    }
    const landlordData = landlordSnap.data() as Landlord;

    const allProperties = await getProperties();
    const batch = writeBatch(db);

    allProperties.forEach(p => {
        let changed = false;
        const newUnits = p.units.map(u => {
            if (u.landlordId === landlordId) {
                changed = true;
                const { landlordId: _, ...rest } = u;
                return rest;
            }
            return u;
        });
        if (changed) {
            batch.update(doc(db, 'properties', p.id), { units: newUnits });
        }
    });

    batch.delete(landlordRef);
    if (landlordData.userId) {
        const userRef = doc(db, 'users', landlordData.userId);
        batch.update(userRef, { role: 'viewer', landlordId: deleteField() });
    }

    await batch.commit();
    cacheService.clear('landlords');
    cacheService.clear('properties');
    cacheService.clear('users');
    await logActivity(`Deleted landlord: ${landlordData.name}`);
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

export async function addMaintenanceUpdate(requestId: string, update: MaintenanceUpdate) {
    try {
        const requestRef = doc(db, 'maintenanceRequests', requestId);
        await updateDoc(requestRef, {
            updates: arrayUnion(update),
            updatedAt: new Date().toISOString()
        });
        cacheService.clear('maintenanceRequests');
    } catch (error: any) {
        console.error("Error adding maintenance update:", error);
        throw new Error("Failed to post response. Please try again.");
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
    }, 60000);
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

    let tenantForReading: Tenant | null = null;
    const tenantsSnapshot = await getDocs(query(collection(db, 'tenants'), where('propertyId', '==', propertyId), where('unitName', '==', unitName), limit(1)));

    if (! tenantsSnapshot.empty) {
        tenantForReading = { id: tenantsSnapshot.docs[0].id, ...tenantsSnapshot.docs[0].data() } as Tenant;
    } else {
        const allOwners = await getPropertyOwners();
        const allLandlords = await getLandlords();

        let owner: PropertyOwner | Landlord | undefined;

        const foundOwner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === propertyId && au.unitNames.includes(unitName)));
        if (foundOwner) {
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

    const reconciliationUpdates = reconcileMonthlyBilling(tenantForReading, unit, asOfDate || new Date());
    
    // Note: We no longer add 'amount' to reconciliationUpdates.dueBalance here
    // because the user wants utility and rent balances to be strictly siloed.
    // The high-level dueBalance now strictly represents Rent/Service Charges.

    if (Object.keys(reconciliationUpdates).length > 0) {
        const tenantRef = doc(db, 'tenants', originalTenant.id);
        await updateDoc(tenantRef, reconciliationUpdates);
        cacheService.clear('tenants');
    }

    await logActivity(`Added water reading for unit ${data.unitName}`);
}

export async function addPayment(
    tenantId: string,
    entry: {
        amount: number,
        date: string,
        notes?: string,
        rentForMonth?: string,
        type: Payment['type'],
        paymentMethod?: Payment['paymentMethod'],
        transactionId?: string,
        waterReadingId?: string,
    }
) {
    const tenant = await getTenant(tenantId);
    if (!tenant) throw new Error("Tenant not found.");
    validatePayment(entry.amount, new Date(entry.date), tenant, entry.type);

    const paymentDocRef = await addDoc(collection(db, 'payments'), {
        tenantId,
        ...entry,
        status: 'Paid',
        createdAt: new Date().toISOString()
    });

    const paymentUpdate = processPayment(tenant, entry.amount, entry.type, new Date(entry.date));
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, paymentUpdate);

    if (entry.type === 'Water' && entry.waterReadingId) {
        const readingRef = doc(db, 'waterReadings', entry.waterReadingId);
        await updateDoc(readingRef, { status: 'Paid', paymentId: paymentDocRef.id });
    }

    cacheService.clear('tenants');
    cacheService.clear('payments');
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

export async function getPaymentsForTenants(tenantIds: string[]): Promise<Payment[]> {
    if (tenantIds.length === 0) {
        return [];
    }
    const cacheKey = `tenants-payments-${tenantIds.slice(0, 5).join('-')}`; 
    return cacheService.getOrFetch('payments', cacheKey, async () => {
        const paymentChunks: Payment[][] = [];
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

    const tempTenant = await getTenant(tenantId);
    if (!tempTenant) throw new Error("Tenant not found before transaction.");
    const property = await getProperty(tempTenant.propertyId);
    const unit = property?.units.find(u => u.name === tempTenant.unitName);

    await runTransaction(db, async (transaction) => {
        const tenantSnap = await transaction.get(tenantRef);
        if (!tenantSnap.exists()) {
            throw new Error("Tenant not found during transaction");
        }

        let workingTenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;

        const reconciliationUpdates = reconcileMonthlyBilling(workingTenant, unit, new Date());

        if (reconciliationUpdates.dueBalance !== undefined) workingTenant.dueBalance = reconciliationUpdates.dueBalance;
        if (reconciliationUpdates.accountBalance !== undefined) workingTenant.accountBalance = reconciliationUpdates.accountBalance;
        if (reconciliationUpdates['lease.paymentStatus']) workingTenant.lease.paymentStatus = reconciliationUpdates['lease.paymentStatus'];
        if (reconciliationUpdates['lease.lastBilledPeriod']) workingTenant.lease.lastBilledPeriod = reconciliationUpdates['lease.lastBilledPeriod'];

        for (const entry of paymentEntries) {
            validatePayment(entry.amount, new Date(entry.date), workingTenant, entry.type);
        }

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

            // processPayment is now siloed - it only updates dueBalance if the type is NOT 'Water'
            const paymentProcessingUpdates = processPayment(workingTenant, entry.amount, entry.type, new Date(entry.date));

            workingTenant = {
                ...workingTenant,
                dueBalance: paymentProcessingUpdates.dueBalance !== undefined ? paymentProcessingUpdates.dueBalance : workingTenant.dueBalance,
                accountBalance: paymentProcessingUpdates.accountBalance !== undefined ? paymentProcessingUpdates.accountBalance : workingTenant.accountBalance,
                lease: {
                    ...workingTenant.lease,
                    paymentStatus: paymentProcessingUpdates['lease.paymentStatus'] || workingTenant.lease.paymentStatus,
                    lastPaymentDate: paymentProcessingUpdates['lease.lastPaymentDate'] || workingTenant.lease.lastPaymentDate,
                }
            };
        }

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
export async function addTask(taskData: Omit<Task, 'id' | 'createdAt'>): Promise<void> {
    await addDoc(collection(db, 'tasks'), {
        ...taskData,
        createdAt: new Date().toISOString(),
    });
    cacheService.clear('tasks');
}

export async function updatePayment(
    paymentId: string,
    data: Partial<Payment>,
    reason: string,
    editorId: string
): Promise<void> {
    const paymentRef = doc(db, 'payments', paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) {
        throw new Error("Payment record not found.");
    }
    const originalPayment = paymentSnap.data() as Payment;

    const editRecord = {
        editedAt: new Date().toISOString(),
        editedBy: editorId,
        reason: reason,
        previousValues: {
            amount: originalPayment.amount,
            date: originalPayment.date,
            notes: originalPayment.notes,
        },
    };

    await updateDoc(paymentRef, {
        ...data,
        editHistory: arrayUnion(editRecord),
    });

    cacheService.clear('payments');
    await logActivity(`Edited payment ${paymentId}. Reason: ${reason}`, editorId);
}

export async function forceRecalculateTenantBalance(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (!tenant) throw new Error("Tenant not found for balance recalculation.");

    const payments = await getPaymentHistory(tenantId);
    const property = await getProperty(tenant.propertyId);
    const unit = property?.units.find(u => u.name === tenant.unitName);

    const { finalDueBalance, finalAccountBalance } = generateLedger(tenant, payments, [property!], [], undefined, new Date(), { includeWater: false });

    const latestPayment = payments[0]; 

    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
        dueBalance: finalDueBalance,
        accountBalance: finalAccountBalance,
        'lease.paymentStatus': getRecommendedPaymentStatus({ dueBalance: finalDueBalance }),
        'lease.lastPaymentDate': latestPayment ? latestPayment.date : tenant.lease.lastPaymentDate,
    });
    cacheService.clear('tenants');
    await logActivity(`Forced balance recalculation for tenant ${tenant.name}.`);
}



export function listenToTasks(callback: (tasks: Task[]) => void): () => void {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const tasks = querySnapshot.docs.map(doc => postToJSON<Task>(doc));
        callback(tasks);
    }, (error) => {
        console.error("Error listening to tasks:", error);
    });

    return unsubscribe;
}

export async function addNoticeToVacate(notice: Omit<NoticeToVacate, 'id'>) {
    await addDoc(collection(db, 'noticesToVacate'), notice);
    cacheService.clear('noticesToVacate');
    await logActivity(`Submitted notice to vacate for ${notice.tenantName}`);
}

export async function getNoticesToVacate(): Promise<NoticeToVacate[]> {
    return cacheService.getOrFetch('noticesToVacate', 'all', () => {
        const q = query(collection(db, 'noticesToVacate'), orderBy('scheduledMoveOutDate', 'desc'));
        return getCollection<NoticeToVacate>(q);
    }, 120000);
}

export async function processOverdueNotices(editorId: string) {
    const today = new Date();
    const q = query(collection(db, 'noticesToVacate'), where('status', '==', 'Active'));
    const snapshot = await getDocs(q);
    const notices = snapshot.docs.map(doc => postToJSON<NoticeToVacate>(doc));

    let processedCount = 0;
    let errorCount = 0;
    const batch = writeBatch(db);

    for (const notice of notices) {
        if (new Date(notice.scheduledMoveOutDate) < today) {
            try {
                const tenantRef = doc(db, 'tenants', notice.tenantId);
                const tenantSnap = await getDoc(tenantRef);
                if (tenantSnap.exists()) {
                    const tenantData = tenantSnap.data() as Tenant;
                    const archivedTenantRef = doc(db, 'archived_tenants', notice.tenantId);
                    batch.set(archivedTenantRef, { ...tenantData, archivedAt: new Date().toISOString(), status: 'archived' });
                    batch.delete(tenantRef);

                    const propertyRef = doc(db, 'properties', notice.propertyId);
                    const propertySnap = await getDoc(propertyRef);
                    if (propertySnap.exists()) {
                        const propertyData = propertySnap.data() as Property;
                        const updatedUnits = propertyData.units.map(u =>
                            u.name === notice.unitName ? { ...u, status: 'vacant' as UnitStatus } : u
                        );
                        batch.update(propertyRef, { units: updatedUnits });
                    }
                }

                const noticeRef = doc(db, 'noticesToVacate', notice.id);
                batch.update(noticeRef, { status: 'Completed' });

                await logActivity(`Processed move-out for ${notice.tenantName} in unit ${notice.unitName}.`, editorId);
                processedCount++;
            } catch (error) {
                console.error(`Error processing notice ${notice.id}:`, error);
                errorCount++;
            }
        }
    }

    if (processedCount > 0) {
        await batch.commit();
        cacheService.clear('tenants');
        cacheService.clear('archived_tenants');
        cacheService.clear('properties');
        cacheService.clear('noticesToVacate');
    }

    return { processedCount, errorCount };
}
