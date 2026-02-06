

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
    Lease
} from './types';
import { db, firebaseConfig, sendPaymentReceipt } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, arrayUnion, writeBatch, orderBy, deleteDoc, limit, onSnapshot, runTransaction, collectionGroup, deleteField, startAfter, DocumentReference } from 'firebase/firestore';
import { auth } from './firebase';
import { reconcileMonthlyBilling, processPayment, validatePayment, getRecommendedPaymentStatus, generateLedger } from './financial-logic';
import { format, startOfMonth, addMonths, parseISO } from "date-fns";

const WATER_RATE = 150; // Ksh per unit

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

export async function getUsers(): Promise<UserProfile[]> {
    const [users, properties, landlords, propertyOwners] = await Promise.all([
        getCollection<UserProfile>('users'),
        getProperties(),
        getLandlords(),
        getPropertyOwners(),
    ]);

    const investorIds = new Set<string>();
    const clientIds = new Set<string>();

    const allCombinedOwners: (Landlord | PropertyOwner)[] = [...landlords, ...propertyOwners];

    for (const owner of allCombinedOwners) {
        let unitsOfOwner: Unit[] = [];

        // Find units associated with this owner
        properties.forEach(p => {
            p.units.forEach(u => {
                let isOwned = false;
                // Check if owned via landlordId
                if (u.landlordId === owner.id) {
                    isOwned = true;
                }
                // Check if owned via assignedUnits (for PropertyOwners)
                if ('assignedUnits' in owner && (owner as PropertyOwner).assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name))) {
                    isOwned = true;
                }
                if (isOwned) {
                    unitsOfOwner.push(u);
                }
            });
        });

        unitsOfOwner = [...new Map(unitsOfOwner.map(item => [`${item.propertyId}-${item.name}`, item])).values()];

        if (unitsOfOwner.length === 0) continue;

        const isInvestor = unitsOfOwner.some(u => u.managementStatus === 'Rented for Clients' || u.managementStatus === 'Rented for Soil Merchants' || u.managementStatus === 'Airbnb');
        const isClient = unitsOfOwner.some(u => u.managementStatus === 'Client Managed');

        if (isClient && !isInvestor) {
            clientIds.add(owner.id);
        } else if (isInvestor) {
            investorIds.add(owner.id);
        }
    }

    return users.map(user => {
        const ownerId = user.landlordId || user.propertyOwnerId;
        if (ownerId) {
            if (clientIds.has(ownerId)) {
                return { ...user, role: 'homeowner' };
            }
            if (investorIds.has(ownerId)) {
                return { ...user, role: 'landlord' };
            }
        }
        return user;
    });
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) throw new Error("User not found.");
        const userEmail = userSnap.data().email;

        await updateDoc(userRef, { role });
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
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(1000));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Log));
}

async function getCollection<T>(collectionName: string, queryConstraints: any[] = []): Promise<T[]> {
    const q = query(collection(db, collectionName), ...queryConstraints);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
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

    const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    const lastDocId = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1].id : null;

    return { items, lastDocId };
}

async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as T;
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

export async function getTenants(limitCount?: number): Promise<Tenant[]> {
    const constraints: any[] = [];
    if (limitCount) constraints.push(limit(limitCount));
    return getCollection<Tenant>('tenants', constraints);
}

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    return getCollection<ArchivedTenant>('archived_tenants');
}

export async function getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const q = query(
        collection(db, 'maintenanceRequests'),
        where('createdAt', '>=', ninetyDaysAgo),
        orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
}

export async function getAllMaintenanceRequestsForReport(): Promise<MaintenanceRequest[]> {
    const q = query(collection(db, 'maintenanceRequests'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
}

export async function getProperty(id: string): Promise<Property | null> {
    return getDocument<Property>('properties', id);
}

export async function getTenantWaterReadings(tenantId: string): Promise<WaterMeterReading[]> {
    if (!tenantId) return [];
    const readingsQuery = query(
        collection(db, 'waterReadings'),
        where('tenantId', '==', tenantId),
        orderBy('createdAt', 'desc'),
        limit(12)
    );
    const readingsSnapshot = await getDocs(readingsQuery);
    return readingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));
}

export async function getAllWaterReadings(): Promise<WaterMeterReading[]> {
    const q = query(collectionGroup(db, 'waterReadings'), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));
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
    return { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as WaterMeterReading;
}

export async function getTenant(id: string): Promise<Tenant | null> {
    return getDocument<Tenant>('tenants', id);
}

export async function getPayment(id: string): Promise<Payment | null> {
    return getDocument<Payment>('payments', id);
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

    // For homeowners, service charge billing start date is determined by handover date
    let lastBilledPeriod = format(new Date(leaseStartDate), 'yyyy-MM');
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
        // Last billed period is the month *before* the first billable one.
        lastBilledPeriod = format(addMonths(firstBillableMonth, -1), 'yyyy-MM');
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
}

export async function addProperty(property: Omit<Property, 'id' | 'imageId'>): Promise<void> {
    const newPropertyData = {
        ...property,
        imageId: `property-${Math.floor(Math.random() * 3) + 1}`,
    };

    await addDoc(collection(db, "properties"), newPropertyData);
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


        await logActivity(`Archived resident: ${tenant.name}`);
    }
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    const oldTenant = await getTenant(tenantId);
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, tenantData);

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
    const userProfileRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userProfileRef);
    if (docSnap.exists()) {
        const userProfile = { id: docSnap.id, ...docSnap.data() } as UserProfile;

        if ((userProfile.role === 'tenant' || userProfile.role === 'homeowner') && userProfile.tenantId) {
            const tenantDetails = await getTenant(userProfile.tenantId);
            userProfile.tenantDetails = tenantDetails ?? undefined;
        }
        return userProfile;
    }
    return null;
}

export async function addMaintenanceRequest(request: Omit<MaintenanceRequest, 'id' | 'date' | 'status' | 'createdAt'>) {
    try {
        await addDoc(collection(db, 'maintenanceRequests'), {
            ...request,
            date: new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
            status: 'New',
        });
        await logActivity(`Submitted maintenance request`);
    } catch (error: any) {
        console.error("Error adding maintenance request:", error);
        throw new Error("Failed to submit maintenance request. Please try again later.");
    }
}

export async function updateMaintenanceRequestStatus(requestId: string, status: MaintenanceRequest['status']) {
    try {
        const requestRef = doc(db, 'maintenanceRequests', requestId);
        await updateDoc(requestRef, { status });
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
    const q = query(
        collection(db, "maintenanceRequests"),
        where("tenantId", "==", tenantId),
        orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));

    return requests;
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

    // 3. Run reconciliation on the current tenant state to update rent, but DO NOT add the water bill to the balance.
    const reconciliationUpdates = reconcileMonthlyBilling(tenantForReading, unit, asOfDate || new Date());

    // 4. Update tenant in Firestore if there are any rent reconciliation updates
    if (Object.keys(reconciliationUpdates).length > 0) {
        const tenantRef = doc(db, 'tenants', originalTenant.id);
        await updateDoc(tenantRef, reconciliationUpdates);
    }

    await logActivity(`Added water reading for unit ${data.unitName}`);
}

export async function getPaymentHistory(tenantId: string, options?: { startDate?: string, endDate?: string }): Promise<Payment[]> {
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
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function getTenantPayments(tenantId: string): Promise<Payment[]> {
    if (!tenantId) return [];
    return getPaymentHistory(tenantId);
}

export async function getPropertyWaterReadings(propertyId: string): Promise<WaterMeterReading[]> {
    const property = await getProperty(propertyId);
    if (!property) return [];
    const unitNames = property.units.map(u => u.name);

    // chunk into groups of 30 for the 'in' query
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
    const readings: WaterMeterReading[] = snapshots.flatMap(snapshot =>
        snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading))
    );

    return readings;
}

export async function getPropertyMaintenanceRequests(propertyId: string): Promise<MaintenanceRequest[]> {
    const q = query(
        collection(db, 'maintenanceRequests'),
        where('propertyId', '==', propertyId),
        orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
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
                createdAt: new Date(),
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



// Landlord Functions

export async function getCommunications(): Promise<Communication[]> {
    return getCollection<Communication>('communications');
}

export async function getFinancialDocuments(userId: string, role: UserRole): Promise<FinancialDocument[]> {
    let documents: FinancialDocument[] = [];

    // Logic for Landlords and Property Owners (View documents for all their units)
    if (role === 'landlord' || role === 'homeowner') {
        let associatedUnitNames: string[] = [];
        let associatedPropertyIds: string[] = [];

        if (role === 'landlord') {
            // Find landlord record linked to this user
            const allLandlords = await getLandlords();
            const landlord = allLandlords.find(l => l.email === userId || l.userId === userId); // Basic matching
            if (landlord) {
                const allProps = await getProperties();
                allProps.forEach(p => {
                    p.units.forEach(u => {
                        if (u.landlordId === landlord.id) {
                            associatedUnitNames.push(u.name);
                            if (!associatedPropertyIds.includes(p.id)) associatedPropertyIds.push(p.id);

                            // Logic: If unit is vacant and handed over, Landlord pays service charge
                            if (u.status === 'vacant' && u.handoverStatus === 'Handed Over') {
                                const scAmount = u.serviceCharge ?? (u.unitType === 'Studio' ? 2000 : u.unitType === 'One Bedroom' ? 3000 : u.unitType === 'Two Bedroom' ? 4000 : 0);
                                if (scAmount > 0) {
                                    const today = new Date();
                                    const currentPeriod = today.toLocaleDateString('default', { month: 'long', year: 'numeric' });

                                    // Generate a service charge document
                                    documents.push({
                                        id: `sc-landlord-${u.name}-${currentPeriod.replace(' ', '-')}`,
                                        type: 'Service Charge',
                                        date: today.toISOString(),
                                        amount: scAmount,
                                        title: `Service Charge (Vacant) - ${u.name}`,
                                        status: 'Pending',
                                        sourceData: {
                                            id: `sc-stmt-${u.name}-${Date.now()}`,
                                            tenantId: 'vacant',
                                            propertyId: p.name, // Using name as ID here as per existing pattern or actual ID
                                            unitName: u.name,
                                            period: currentPeriod,
                                            amount: scAmount,
                                            items: [{ description: 'Vacant Unit Service Charge', amount: scAmount }],
                                            date: today.toISOString(),
                                            status: 'Pending',
                                            createdAt: today
                                        } as ServiceChargeStatement
                                    });
                                }
                            }
                        }
                    });
                });
            }
        } else if (role === 'homeowner') {
            // Find property owner record
            const allOwners = await getPropertyOwners();
            const owner = allOwners.find(o => o.email === userId);
            if (owner) {
                owner.assignedUnits.forEach(au => {
                    au.unitNames.forEach(name => {
                        associatedUnitNames.push(name);
                        if (!associatedPropertyIds.includes(au.propertyId)) associatedPropertyIds.push(au.propertyId);
                    });
                });
            }
        }

        if (associatedUnitNames.length > 0) {
            // Fetch Tenants in these units to get their payments/bills
            const allTenants = await getTenants();
            const keyTenants = allTenants.filter(t =>
                associatedPropertyIds.includes(t.propertyId) && associatedUnitNames.includes(t.unitName)
            );
            const keyTenantIds = keyTenants.map(t => t.id);

            if (keyTenantIds.length > 0) {
                // Fetch Payments
                const paymentsSnapshot = await getDocs(query(collection(db, 'payments'), where('tenantId', 'in', keyTenantIds.slice(0, 30)))); // Limit 30 for 'in' query constraint
                const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));

                documents.push(...payments.map(p => {
                    const t = keyTenants.find(kt => kt.id === p.tenantId);
                    return {
                        id: p.id,
                        type: 'Rent Receipt' as const,
                        date: p.date,
                        amount: p.amount,
                        title: `Rent Paid - ${t?.unitName} (${t?.name})`,
                        status: 'Paid' as const,
                        sourceData: p
                    };
                }));

                // Fetch Water Bills
                const waterSnapshot = await getDocs(query(collection(db, 'waterReadings'), where('tenantId', 'in', keyTenantIds.slice(0, 30))));
                const readings = waterSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));

                documents.push(...readings.map(r => {
                    const t = keyTenants.find(kt => kt.id === r.tenantId);
                    return {
                        id: r.id,
                        type: 'Water Bill' as const,
                        date: r.date,
                        amount: r.amount,
                        title: `Water Bill - ${t?.unitName}`,
                        status: 'Paid' as const,
                        sourceData: r
                    };
                }));
            }
        }
    }

    // Logic for Tenants (View their own documents)
    if (role === 'tenant') {
        const tenant = (await getTenants()).find(t => t.userId === userId);

        if (tenant) {
            // 1. Fetch Payments (Rent Receipts)
            const paymentsQuery = query(
                collection(db, 'payments'),
                where('tenantId', '==', tenant.id),
                orderBy('date', 'desc'),
                limit(20)
            );
            const paymentsSnapshot = await getDocs(paymentsQuery);
            const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));

            documents.push(...payments.map(p => ({
                id: p.id,
                type: 'Rent Receipt' as const,
                date: p.date,
                amount: p.amount,
                title: `Rent Payment - ${new Date(p.date).toLocaleDateString('default', { month: 'short', year: 'numeric' })}`,
                status: 'Paid' as const,
                sourceData: p
            })));

            // 2. Fetch Water Meter Readings (Water Bills)
            const waterQuery = query(
                collection(db, 'waterReadings'),
                where('tenantId', '==', tenant.id),
                orderBy('date', 'desc'),
                limit(10)
            );
            const waterSnapshot = await getDocs(waterQuery);
            const readings = waterSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));

            documents.push(...readings.map(r => ({
                id: r.id,
                type: 'Water Bill' as const,
                date: r.date,
                amount: r.amount,
                title: `Water Bill - ${new Date(r.date).toLocaleDateString('default', { month: 'short', year: 'numeric' })}`,
                status: 'Paid' as const,
                sourceData: r
            })));

            // 3. Mock Service Charge Statements
            if (tenant.lease.serviceCharge && tenant.lease.serviceCharge > 0) {
                for (let i = 0; i < 3; i++) {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    const period = d.toLocaleDateString('default', { month: 'long', year: 'numeric' });

                    const stmt: ServiceChargeStatement = {
                        id: `sc-${tenant.id}-${i}`,
                        tenantId: tenant.id,
                        propertyId: tenant.propertyId,
                        unitName: tenant.unitName,
                        period: period,
                        amount: tenant.lease.serviceCharge,
                        items: [{ description: 'General Maintenance', amount: tenant.lease.serviceCharge * 0.7 }, { description: 'Security', amount: tenant.lease.serviceCharge * 0.3 }],
                        date: d.toISOString(),
                        status: 'Paid',
                        createdAt: d
                    };

                    documents.push({
                        id: stmt.id,
                        type: 'Service Charge' as const,
                        date: stmt.date,
                        amount: stmt.amount,
                        title: `Service Charge - ${period}`,
                        status: 'Paid',
                        sourceData: stmt
                    });
                }
            }
        }
    }

    return documents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getLandlords(): Promise<Landlord[]> {
    return getCollection<Landlord>('landlords');
}

export async function getLandlord(landlordId: string): Promise<Landlord | null> {
    return getDocument<Landlord>('landlords', landlordId);
}

export async function addOrUpdateLandlord(landlord: Landlord, assignedUnitNames: string[]): Promise<void> {
    const landlordRef = doc(db, 'landlords', landlord.id);
    const batch = writeBatch(db);

    let finalLandlordData: Partial<Landlord> = { ...landlord };

    // --- Auth User & Profile Linking ---
    if (landlord.email && landlord.phone && !landlord.userId) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where("email", "==", landlord.email), limit(1));
        const userSnap = await getDocs(q);

        if (!userSnap.empty) {
            // User with this email already exists, link them.
            const existingUser = userSnap.docs[0];
            finalLandlordData.userId = existingUser.id;
            await setDoc(existingUser.ref, { role: 'landlord', landlordId: landlord.id }, { merge: true });
        } else {
            // No user exists, create a new one.
            const appName = 'landlord-creation-app-' + Date.now();
            let secondaryApp;
            try {
                secondaryApp = initializeApp(firebaseConfig, appName);
                const secondaryAuth = getAuth(secondaryApp);
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, landlord.email, landlord.phone);
                const userId = userCredential.user.uid;
                finalLandlordData.userId = userId;

                await createUserProfile(userId, landlord.email, 'landlord', { name: landlord.name, landlordId: landlord.id });
                await logActivity(`Created landlord user: ${landlord.email}`);
            } catch (error: any) {
                if (error.code !== 'auth/email-already-in-use') {
                    console.error("Error creating landlord auth user:", error);
                    throw new Error("Failed to create landlord login credentials.");
                }
            } finally {
                if (secondaryApp) await deleteApp(secondaryApp);
            }
        }
    }
    // --- End Auth Logic ---
    
    if (finalLandlordData.userId === undefined) {
        delete finalLandlordData.userId;
    }

    // Set/update the landlord document itself
    batch.set(landlordRef, finalLandlordData, { merge: true });

    const properties = await getProperties();
    for (const prop of properties) {
        let needsUpdate = false;
        const newUnits = prop.units.map(unit => {
            if (unit.ownership !== 'Landlord') return unit;

            const shouldBeAssigned = assignedUnitNames.includes(unit.name);
            const isAssigned = unit.landlordId === landlord.id;

            if (shouldBeAssigned && !isAssigned) {
                needsUpdate = true;
                return { ...unit, landlordId: landlord.id };
            }
            if (!shouldBeAssigned && isAssigned) {
                needsUpdate = true;
                const { landlordId: _, ...rest } = unit; // Remove landlordId
                return rest as Unit;
            }
            return unit;
        });

        if (needsUpdate) {
            const propRef = doc(db, 'properties', prop.id);
            batch.update(propRef, { units: newUnits });
        }
    }


    await batch.commit();
    await logActivity(`Updated landlord and assignments for: ${landlord.name}`);
}

export async function addLandlordsFromCSV(data: { name: string; email: string; phone: string; bankAccount?: string }[]): Promise<{ added: number; skipped: number }> {
    const landlordsRef = collection(db, 'landlords');
    const batch = writeBatch(db);
    let added = 0;
    let skipped = 0;

    const existingLandlordsSnap = await getDocs(query(landlordsRef));
    const existingEmails = new Set(existingLandlordsSnap.docs.map(doc => doc.data().email));

    for (const landlordData of data) {
        if (!landlordData.email || existingEmails.has(landlordData.email)) {
            skipped++;
            continue;
        }

        const newLandlordRef = doc(landlordsRef);
        const landlordWithId = {
            ...landlordData,
            id: newLandlordRef.id,
        };

        batch.set(newLandlordRef, landlordWithId);
        existingEmails.add(landlordData.email);
        added++;
    }

    await batch.commit();
    if (added > 0) {
        await logActivity(`Bulk added ${added} landlords via CSV.`);
    }
    return { added, skipped };
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
            paymentStatus: 'Paid' as const, // Start as paid, reconciliation will create first charge.
            lastBilledPeriod: lastBilledPeriod, // Set to month before first charge
        },
        securityDeposit: 0,
        waterDeposit: 0,
        dueBalance: 0, // Start with zero balance
        accountBalance: 0,
        userId: owner.userId,
    };

    const tenantDocRef = await addDoc(tenantsRef, newTenantData);
    await logActivity(`Auto-created homeowner resident account for ${owner.name} for unit ${unit.name}`);

    // Also update the User profile if it exists and doesn't have a tenantId yet.
    // We don't want to overwrite a primary tenantId if they are also a tenant elsewhere.
    if (owner.userId) {
        const userRef = doc(db, 'users', owner.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && !userSnap.data().tenantId) {
            await updateDoc(userRef, { tenantId: tenantDocRef.id });
        }
    }

    return { id: tenantDocRef.id, ...newTenantData } as Tenant;
}


// Property Owner (Client) Functions
export async function getPropertyOwners(): Promise<PropertyOwner[]> {
    return getCollection<PropertyOwner>('propertyOwners');
}

export async function getPropertyOwner(ownerId: string): Promise<PropertyOwner | null> {
    return getDocument<PropertyOwner>('propertyOwners', ownerId);
}

export async function deletePropertyOwner(ownerId: string): Promise<void> {
    const owner = await getPropertyOwner(ownerId);
    if (!owner) {
        throw new Error("Property Owner not found.");
    }

    const batch = writeBatch(db);

    const ownerRef = doc(db, 'propertyOwners', ownerId);
    batch.delete(ownerRef);

    if (owner.userId) {
        const userRef = doc(db, 'users', owner.userId);
        batch.update(userRef, {
            propertyOwnerId: deleteField(),
            role: 'viewer'
        });
    }

    await batch.commit();
    await logActivity(`Deleted property owner: ${owner.name} (${owner.email})`);
}

export async function deleteLandlord(landlordId: string): Promise<void> {
    if (landlordId === 'soil_merchants_internal') {
        throw new Error("Cannot delete the internal Soil Merchants profile.");
    }

    const landlord = await getLandlord(landlordId);
    if (!landlord) {
        throw new Error("Landlord not found.");
    }

    const batch = writeBatch(db);
    const properties = await getProperties();

    for (const prop of properties) {
        let needsUpdate = false;
        const newUnits = prop.units.map(unit => {
            if (unit.landlordId === landlordId) {
                needsUpdate = true;
                const { landlordId: _, ...rest } = unit;
                return rest as Unit;
            }
            return unit;
        });

        if (needsUpdate) {
            const propRef = doc(db, 'properties', prop.id);
            batch.update(propRef, { units: newUnits });
        }
    }

    const landlordRef = doc(db, 'landlords', landlordId);
    batch.delete(landlordRef);

    if (landlord.userId) {
        const userRef = doc(db, 'users', landlord.userId);
        batch.update(userRef, {
            landlordId: deleteField(),
            role: 'viewer'
        });
    }

    await batch.commit();
    await logActivity(`Deleted landlord: ${landlord.name} (${landlord.email})`);
}

export async function updatePropertyOwner(
    ownerId: string,
    data: Partial<PropertyOwner> & { email: string; phone: string; name: string }
): Promise<void> {
    const ownerRef = doc(db, 'propertyOwners', ownerId);
    let userId = data.userId;

    if (data.email && data.phone && !userId) {
        const appName = 'owner-creation-app-' + Date.now();
        let secondaryApp;
        try {
            secondaryApp = initializeApp(firebaseConfig, appName);
        } catch (e) {
            secondaryApp = getApp(appName);
        }

        const secondaryAuth = getAuth(secondaryApp);
        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.phone);
            userId = userCredential.user.uid;

            await createUserProfile(userId, data.email, 'homeowner', {
                name: data.name,
                propertyOwnerId: ownerId,
            });
            await logActivity(`Created property owner user: ${data.email}`);
        } catch (error: any) {
            if (error.code !== 'auth/email-already-in-use') {
                console.error("Error creating property owner auth user:", error);
                throw new Error("Failed to create property owner login credentials.");
            } else {
                console.log("Email for property owner already in use, skipping auth creation.");
            }
        } finally {
            if (secondaryApp) {
                await deleteApp(secondaryApp);
            }
        }
    }

    const finalData: { [key: string]: any } = { ...data };
    const resolvedUserId = userId || data.userId;

    if (resolvedUserId) {
        finalData.userId = resolvedUserId;
    } else {
        delete finalData.userId;
    }

    await setDoc(ownerRef, finalData, { merge: true });
    await logActivity(`Updated property owner details: ${data.name || ownerId}`);
}

export async function getLandlordPropertiesAndUnits(landlordId: string): Promise<{ property: Property, units: Unit[] }[]> {
    const allProperties = await getProperties();
    const result: { property: Property, units: Unit[] }[] = [];

    allProperties.forEach(p => {
        const units = p.units.filter(u => u.landlordId === landlordId || (p.landlordId === landlordId));
        if (units.length > 0) {
            result.push({ property: p, units: units });
        }
    });

    return result;
}

export async function getAllPaymentsForReport(): Promise<Payment[]> {
    return getCollection<Payment>('payments');
}

export async function getAllPayments(limitCount: number = 50): Promise<Payment[]> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const q = query(
        collection(db, 'payments'),
        where('date', '>=', dateStr),
        orderBy('date', 'desc'),
        limit(limitCount)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<void> {
    try {
        await addDoc(collection(db, 'tasks'), {
            ...task,
            createdAt: serverTimestamp(),
        });
        await logActivity(`Created task: ${task.title}`);
    } catch (error: any) {
        console.error("Error adding task:", error);
        throw new Error("Failed to create task.");
    }
}

export async function getTasks(): Promise<Task[]> {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'asc')); // FIFO
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const createdAt = data.createdAt;
        return {
            id: doc.id,
            ...data,
            createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : createdAt
        } as Task;
    });
}

// Real-time listener functions
export function listenToProperties(callback: (properties: Property[]) => void): () => void {
    const q = query(collection(db, 'properties'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const properties = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));

        const desiredOrder = [
            'Midtown Apartments',
            'Grand Midtown Apartments',
            'Grand Midtown Annex Apartments',
        ];

        const sortedProperties = properties.sort((a, b) => {
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

        callback(sortedProperties);
    }, (error) => {
        console.error("Error listening to properties:", error);
    });
    return unsubscribe;
}

export function listenToTenants(callback: (tenants: Tenant[]) => void): () => void {
    const q = query(collection(db, 'tenants'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const tenants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
        callback(tenants);
    }, (error) => {
        console.error("Error listening to tenants:", error);
    });
    return unsubscribe;
}

export function listenToMaintenanceRequests(callback: (requests: MaintenanceRequest[]) => void): () => void {
    const q = query(collection(db, 'maintenanceRequests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
        callback(requests);
    }, (error) => {
        console.error("Error listening to maintenance requests:", error);
    });
    return unsubscribe;
}

export function listenToPayments(callback: (payments: Payment[]) => void): () => void {
    const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const payments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
        callback(payments);
    }, (error) => {
        console.error("Error listening to payments:", error);
    });
    return unsubscribe;
}

export function listenToTasks(callback: (tasks: Task[]) => void): () => void {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const tasks = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt;
            return {
                id: doc.id,
                ...data,
                createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : createdAt
            } as Task;
        });
        callback(tasks);
    }, (error) => {
        console.error("Error listening to tasks:", error);
    });
    return unsubscribe;
}

export async function voidPayment(paymentId: string, reason: string, editorId: string): Promise<void> {
    const paymentRef = doc(db, "payments", paymentId);
  
    await runTransaction(db, async (transaction) => {
      const paymentSnap = await transaction.get(paymentRef);
      if (!paymentSnap.exists()) {
        throw new Error("Payment to void not found.");
      }
      const oldPayment = paymentSnap.data() as Payment;
  
      if (oldPayment.status === "Voided") {
        throw new Error("This payment has already been voided.");
      }
  
      // 1. Create the reversal transaction
      const reversalPaymentRef = doc(collection(db, "payments"));
      const reversalPayment: Omit<Payment, 'id'> = {
        tenantId: oldPayment.tenantId,
        amount: -oldPayment.amount,
        date: oldPayment.date, 
        type: "Reversal",
        status: "Paid",
        notes: `Reversal for transaction ID: ${oldPayment.transactionId}. Reason: ${reason}`,
        rentForMonth: oldPayment.rentForMonth,
        paymentMethod: oldPayment.paymentMethod,
        transactionId: `REV-${oldPayment.transactionId}`,
        createdAt: new Date(),
        linkedTo: oldPayment.id,
      };
      transaction.set(reversalPaymentRef, reversalPayment);
  
      // 2. Mark the original payment as Voided
      transaction.update(paymentRef, { 
          status: 'Voided',
          notes: oldPayment.notes ? `${oldPayment.notes} [VOIDED: ${reason}]` : `[VOIDED: ${reason}]`
      });
  
      // 3. Recalculate tenant balance
      const tenant = await getTenant(oldPayment.tenantId);
      if (tenant) {
          const allPayments = await getPaymentHistory(tenant.id);
          const allTenantWaterReadings = await getTenantWaterReadings(tenant.id);
          const allProperties = await getProperties();
          const { finalDueBalance, finalAccountBalance } = generateLedger(tenant, allPayments, allProperties, allTenantWaterReadings);
          
          const tenantRef = doc(db, 'tenants', tenant.id);
          transaction.update(tenantRef, {
              dueBalance: finalDueBalance + oldPayment.amount, // Add back the voided amount to due balance
              accountBalance: finalAccountBalance
          });
      }
    });
  
    await logActivity(`Voided payment ${paymentId}. Reason: ${reason}`, editorId);
    await forceRecalculateTenantBalance( (await getDocument<Payment>('payments', paymentId))!.tenantId );
}

export async function getAllPendingWaterBills(): Promise<WaterMeterReading[]> {
    const q = query(collectionGroup(db, 'waterReadings'), where('status', '==', 'Pending'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));
}






