'use client';

import { initializeApp, getApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { cacheService } from './cache';
import {
    Property, Unit, WaterMeterReading, Payment, Tenant,
    ArchivedTenant, MaintenanceRequest, UserProfile, Log, Landlord,
    UserRole, UnitStatus, PropertyOwner, FinancialDocument, ServiceChargeStatement, Communication, Task, UnitType,
    unitStatuses, ownershipTypes, unitTypes, managementStatuses, handoverStatuses, UnitOrientation, unitOrientations, Agent,
    NoticeToVacate, MaintenanceStatus, MaintenanceUpdate, OwnershipType, ManagementStatus, HandoverStatus, PaymentStatus
} from './types';
import { db, firebaseConfig, sendPaymentReceipt } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, arrayUnion, writeBatch, orderBy, deleteDoc, limit, onSnapshot, runTransaction, collectionGroup, deleteField, startAfter, DocumentSnapshot, Query, documentId } from 'firebase/firestore';
import { auth } from './firebase';
import { reconcileMonthlyBilling, processPayment, validatePayment, getRecommendedPaymentStatus, generateLedger } from './financial-logic';
import { format, startOfMonth, addMonths, parseISO, isValid } from "date-fns";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const WATER_RATE = 150; 

/**
 * Serializes a Firestore document snapshot to a JSON-compatible object.
 */
function postToJSON<T>(doc: DocumentSnapshot): T {
    const data = doc.data();
    if (!data) return { id: doc.id } as T;
    
    const convertObjectTimestamps = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
        if (Array.isArray(obj)) return obj.map(convertObjectTimestamps);
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

/**
 * Helper to remove undefined fields from data objects before Firestore writes.
 * Firestore does not support undefined values.
 */
export function sanitizeData(data: any) {
    if (typeof data !== 'object' || data === null) return data;
    const sanitized = { ...data };
    Object.keys(sanitized).forEach(key => {
        if (sanitized[key] === undefined) {
            delete sanitized[key];
        }
    });
    return sanitized;
}

/**
 * Logs a user or system action to the activity log.
 */
export async function logActivity(action: string, userEmail?: string | null) {
    const user = auth.currentUser;
    if (!user && !userEmail) return;
    
    const logRef = doc(collection(db, 'logs'));
    const activityData = {
        userId: user?.uid || 'system',
        userEmail: user?.email || userEmail || 'system',
        action,
        timestamp: new Date().toISOString()
    };

    setDoc(logRef, activityData)
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: logRef.path,
                    operation: 'create',
                    requestResourceData: activityData,
                }));
            }
        });
}

/**
 * Logs an automated or manual communication.
 */
export async function logCommunication(data: Omit<Communication, 'id'>) {
    const commRef = doc(collection(db, 'communications'));
    const commData = sanitizeData({
        ...data,
        timestamp: new Date().toISOString(),
    });
    
    setDoc(commRef, commData)
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: commRef.path,
                    operation: 'create',
                    requestResourceData: commData,
                }));
            }
        });
}

/**
 * Optimized helper to fetch a collection with typed data and error emitting.
 */
async function getCollection<T>(collectionOrQuery: string | Query, queryConstraints: any[] = []): Promise<T[]> {
    let q: Query;
    let path = 'unknown';
    
    if (typeof collectionOrQuery === 'string') {
        path = collectionOrQuery;
        q = query(collection(db, collectionOrQuery), ...queryConstraints);
    } else {
        q = collectionOrQuery;
        path = (q as any)._query?.path?.segments?.join('/') || 'query';
    }

    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => postToJSON<T>(doc));
    } catch (serverError: any) {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path,
                operation: 'list',
            }));
        }
        throw serverError;
    }
}

/**
 * Optimized helper to fetch a single document with typed data and error emitting.
 */
async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
    const docRef = doc(db, collectionName, id);
    try {
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? postToJSON<T>(docSnap) : null;
    } catch (serverError: any) {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: `${collectionName}/${id}`,
                operation: 'get',
            }));
        }
        throw serverError;
    }
}

// --- Cached Data Access Functions ---

export async function getProperties(forceRefresh: boolean = false): Promise<Property[]> {
    if (forceRefresh) cacheService.clear('properties');
    
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
    }, 600000); 
}

export async function getLandlords(): Promise<Landlord[]> {
    return cacheService.getOrFetch('landlords', 'all', () => getCollection<Landlord>('landlords'), 600000);
}

export async function getPropertyOwners(): Promise<PropertyOwner[]> {
    return cacheService.getOrFetch('propertyOwners', 'all', () => getCollection<PropertyOwner>('propertyOwners'), 600000);
}

export async function getTenants(options: { propertyId?: string; limit?: number } = {}): Promise<Tenant[]> {
    const { propertyId, limit: limitCount } = options;
    const cacheKey = propertyId ? `prop-${propertyId}` : (limitCount ? `limit-${limitCount}` : 'all');
    
    return cacheService.getOrFetch('tenants', cacheKey, () => {
        const constraints: any[] = [];
        if (propertyId) constraints.push(where("propertyId", "==", propertyId));
        if (limitCount) constraints.push(limit(limitCount));
        return getCollection<Tenant>('tenants', constraints);
    }, propertyId ? 60000 : 300000);
}

export async function getPaymentsForTenants(tenantIds: string[]): Promise<Payment[]> {
    if (tenantIds.length === 0) return [];
    
    const batches = [];
    for (let i = 0; i < tenantIds.length; i += 30) {
        const batchIds = tenantIds.slice(i, i + 30);
        const q = query(collection(db, 'payments'), where('tenantId', 'in', batchIds), orderBy('date', 'desc'));
        batches.push(getCollection<Payment>(q));
    }
    
    const results = await Promise.all(batches);
    return results.flat();
}

export async function getAllPaymentsForReport(): Promise<Payment[]> {
    return cacheService.getOrFetch('payments', 'all-report', () => {
        const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
        return getCollection<Payment>(q);
    }, 300000);
}

export async function getPaymentHistory(tenantId: string): Promise<Payment[]> {
    if (!tenantId) return [];
    return cacheService.getOrFetch('payments', `tenant-${tenantId}`, () => {
        const q = query(collection(db, 'payments'), where('tenantId', '==', tenantId), orderBy('date', 'desc'));
        return getCollection<Payment>(q);
    }, 60000);
}

export async function getPayment(id: string): Promise<Payment | null> {
    return cacheService.getOrFetch('payments', id, () => getDocument<Payment>('payments', id), 60000);
}

export async function getMaintenanceRequests(options: { propertyId?: string } = {}): Promise<MaintenanceRequest[]> {
    const { propertyId } = options;
    const cacheKey = propertyId ? `prop-${propertyId}-last90` : 'all';
    
    return cacheService.getOrFetch('maintenanceRequests', cacheKey, async () => {
        const constraints: any[] = [orderBy('createdAt', 'desc')];
        if (propertyId) constraints.unshift(where('propertyId', '==', propertyId));
        return getCollection<MaintenanceRequest>(query(collection(db, 'maintenanceRequests'), ...constraints));
    }, 60000);
}

export async function getTenantWaterReadings(tenantId: string): Promise<WaterMeterReading[]> {
    return cacheService.getOrFetch('waterReadings', `tenant-${tenantId}`, () => {
        const q = query(collection(db, 'waterReadings'), where('tenantId', '==', tenantId), orderBy('date', 'desc'));
        return getCollection<WaterMeterReading>(q);
    }, 60000);
}

// --- Data Modification Functions ---

export async function addPayment(tenantId: string, payment: any): Promise<void> {
    const payRef = doc(collection(db, 'payments'));
    const paymentData = sanitizeData({
        ...payment,
        tenantId,
        status: 'Paid' as const,
        createdAt: new Date().toISOString()
    });
    
    setDoc(payRef, paymentData)
        .then(() => {
            cacheService.clear('payments');
            logActivity(`Added payment for tenant ${tenantId}`);
            forceRecalculateTenantBalance(tenantId);
        })
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: payRef.path,
                    operation: 'create',
                    requestResourceData: paymentData,
                }));
            }
        });
}

export async function updatePayment(paymentId: string, data: Partial<Payment>, reason: string, editorId: string): Promise<void> {
    const paymentRef = doc(db, 'payments', paymentId);
    const snap = await getDoc(paymentRef);
    if (!snap.exists()) return;
    
    const orig = snap.data() as Payment;
    const updateData = sanitizeData({
        ...data,
        editHistory: arrayUnion({
            editedAt: new Date().toISOString(),
            editedBy: editorId,
            reason,
            previousValues: {
                amount: orig.amount,
                date: orig.date,
                notes: orig.notes
            }
        })
    });

    updateDoc(paymentRef, updateData)
        .then(() => {
            cacheService.clear('payments');
            logActivity(`Updated payment ${paymentId}`, editorId);
        })
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: paymentRef.path,
                    operation: 'update',
                    requestResourceData: updateData
                }));
            }
        });
}

export async function batchProcessPayments(tenantId: string, entries: any[], taskId?: string) {
    const tenantRef = doc(db, 'tenants', tenantId);
    const tenantSnap = await getDoc(tenantRef);
    if (!tenantSnap.exists()) throw new Error("Tenant not found.");
    
    let workingTenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;
    const prop = await getProperty(workingTenant.propertyId);
    const unit = prop?.units.find(u => u.name === workingTenant.unitName);

    await runTransaction(db, async (tx) => {
        const recon = reconcileMonthlyBilling(workingTenant, unit, new Date());
        Object.assign(workingTenant, recon);
        
        for (const entry of entries) {
            const payRef = doc(collection(db, 'payments'));
            const sanitizedEntry = sanitizeData(entry);

            tx.set(payRef, { 
                tenantId, 
                ...sanitizedEntry, 
                status: 'Paid', 
                createdAt: new Date().toISOString() 
            });

            if (entry.type === 'WaterDeposit' && entry.waterReadingId) {
                tx.update(doc(db, 'waterReadings', entry.waterReadingId), { status: 'Paid', paymentId: payRef.id });
            }
            
            const updates = processPayment(workingTenant, entry.amount, entry.type, new Date(entry.date));
            Object.assign(workingTenant, updates);
        }
        
        tx.update(tenantRef, { 
            dueBalance: workingTenant.dueBalance, 
            accountBalance: workingTenant.accountBalance, 
            'lease.paymentStatus': workingTenant.lease.paymentStatus 
        });
    });

    if (taskId) {
        const taskRef = doc(db, 'tasks', taskId);
        updateDoc(taskRef, { status: 'Completed' }).catch(() => {});
    }
    
    cacheService.clear('tenants');
    cacheService.clear('payments');
    logActivity(`Processed batch payments for tenant ${tenantId}`);
}

export async function addWaterMeterReading(data: { propertyId: string; unitName: string; priorReading: number; currentReading: number; date: string; }) {
    const property = await getProperty(data.propertyId);
    if (!property) throw new Error("Property not found.");
    
    const tenantsSnap = await getDocs(query(
        collection(db, 'tenants'), 
        where('propertyId', '==', data.propertyId), 
        where('unitName', '==', data.unitName), 
        limit(1)
    ));
    
    if (tenantsSnap.empty) throw new Error("No resident found for this unit.");
    const tenant = { id: tenantsSnap.docs[0].id, ...tenantsSnap.docs[0].data() } as Tenant;
    
    const consumption = data.currentReading - data.priorReading;
    const amount = consumption * WATER_RATE;
    
    const readingRef = doc(collection(db, 'waterReadings'));
    const readingData = sanitizeData({ 
        ...data, 
        tenantId: tenant.id, 
        consumption, 
        rate: WATER_RATE, 
        amount, 
        createdAt: serverTimestamp(), 
        status: 'Pending' 
    });

    setDoc(readingRef, readingData)
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: readingRef.path,
                    operation: 'create',
                    requestResourceData: readingData,
                }));
            }
        });

    cacheService.clear('waterReadings');
    logActivity(`Added water reading for unit ${data.unitName}`);
}

export async function getProperty(id: string): Promise<Property | null> {
    return cacheService.getOrFetch('properties', id, () => getDocument<Property>('properties', id), 60000);
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    return cacheService.getOrFetch('userProfiles', userId, async () => {
        const snap = await getDoc(doc(db, 'users', userId));
        if (snap.exists()) {
            const profile = postToJSON<UserProfile>(snap);
            if (profile.tenantId) profile.tenantDetails = await getTenant(profile.tenantId) ?? undefined;
            return profile;
        }
        return null;
    }, 60000);
}

export async function getUsers(options: { searchQuery?: string; roleFilters?: UserRole[]; page?: number; pageSize?: number; } = {}): Promise<{ users: UserProfile[]; totalCount: number }> {
    const { searchQuery = '', roleFilters = [], page = 1, pageSize = 10 } = options;
    const [allUsers, properties, landlords, propertyOwners] = await Promise.all([
        getCollection<UserProfile>('users'), 
        getProperties(), 
        getLandlords(), 
        getPropertyOwners()
    ]);
    
    const investorIds = new Set<string>();
    const clientIds = new Set<string>();
    const allCombinedOwners: (Landlord | PropertyOwner)[] = [...landlords, ...propertyOwners];
    const allUnitsMap = new Map<string, Unit>();
    properties.forEach(p => (p.units || []).forEach(u => allUnitsMap.set(`${p.id}-${u.name}`, u)));
    const ownerUnitsMap = new Map<string, Unit[]>();
    allCombinedOwners.forEach(owner => {
        const units: Unit[] = [];
        if ('assignedUnits' in owner) (owner as PropertyOwner).assignedUnits.forEach(au => au.unitNames.forEach(unitName => { const unit = allUnitsMap.get(`${au.propertyId}-${unitName}`); if (unit) units.push(unit); }));
        properties.forEach(p => (p.units || []).forEach(u => { if (u.landlordId === owner.id) units.push(u); }));
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
        filteredUsers = filteredUsers.filter(user => (user.name && user.name.toLowerCase().includes(lowercasedQuery)) || user.email.toLowerCase().includes(lowercasedQuery));
    }
    if (roleFilters.length > 0) filteredUsers = filteredUsers.filter(user => roleFilters.includes(user.role));
    const totalCount = filteredUsers.length;
    const paginatedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
    return { users: paginatedUsers, totalCount };
}

export async function forceRecalculateTenantBalance(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (!tenant) return;
    const [payments, prop] = await Promise.all([getPaymentHistory(tenantId), getProperty(tenant.propertyId)]);
    if (!prop) return;
    const { finalDueBalance, finalAccountBalance } = generateLedger(tenant, payments, [prop], [], null, new Date(), { includeWater: false });
    
    const tenantRef = doc(db, 'tenants', tenantId);
    updateDoc(tenantRef, { 
        dueBalance: finalDueBalance, 
        accountBalance: finalAccountBalance, 
        'lease.paymentStatus': getRecommendedPaymentStatus({ dueBalance: finalDueBalance }) 
    }).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: tenantRef.path,
                operation: 'update',
            }));
        }
    });
    cacheService.clear('tenants');
}

export async function archiveTenant(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (!tenant) return;
    const batch = writeBatch(db);
    batch.set(doc(db, 'archived_tenants', tenantId), { ...tenant, archivedAt: new Date().toISOString(), status: 'archived' });
    batch.delete(doc(db, 'tenants', tenantId));
    const propSnap = await getDoc(doc(db, 'properties', tenant.propertyId));
    if (propSnap.exists()) {
        const updatedUnits = (propSnap.data() as Property).units.map(u => u.name === tenant.unitName ? { ...u, status: 'vacant' as UnitStatus } : u);
        batch.update(propSnap.ref, { units: updatedUnits });
    }
    batch.commit().catch(() => {});
    cacheService.clear('tenants');
}

export async function addTenant(data: { name: string; email: string; phone: string; idNumber: string; propertyId: string; unitName: string; agent: Agent; rent: number; securityDeposit: number; waterDeposit?: number; residentType: 'Tenant' | 'Homeowner'; leaseStartDate: string; }): Promise<void> {
    const { name, email, phone, idNumber, propertyId, unitName, agent, rent, securityDeposit, waterDeposit, leaseStartDate, residentType } = data;
    const property = await getProperty(propertyId);
    if (!property) throw new Error("Property not found.");
    const unit = property.units.find(u => u.name === unitName);
    if (!unit) throw new Error("Unit not found.");
    
    const initialDue = rent + (securityDeposit || 0) + (waterDeposit || 0);
    const newTenantData = sanitizeData({ 
        name, email, phone, idNumber, propertyId, unitName, agent, status: 'active' as const, residentType, 
        lease: { startDate: leaseStartDate, endDate: addMonths(new Date(leaseStartDate), 12).toISOString().split('T')[0], rent, serviceCharge: unit.serviceCharge || 0, paymentStatus: 'Pending' as const, lastBilledPeriod: format(new Date(leaseStartDate), 'yyyy-MM') }, 
        securityDeposit: securityDeposit || 0, waterDeposit: waterDeposit || 0, dueBalance: initialDue, accountBalance: 0 
    });
    
    const tenantRef = doc(collection(db, 'tenants'));
    const tenantId = tenantRef.id;
    
    setDoc(tenantRef, newTenantData).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: tenantRef.path,
                operation: 'create',
                requestResourceData: newTenantData,
            }));
        }
    });
    
    const taskRef = doc(collection(db, 'tasks'));
    const taskData = sanitizeData({ 
        title: `Onboard: ${name}`, 
        description: `Onboarding pending for ${name}. Balance: Ksh ${initialDue.toLocaleString()}`, 
        status: 'Pending', 
        priority: 'High', 
        category: 'Financial', 
        tenantId: tenantId, 
        propertyId, 
        unitName, 
        dueDate: addMonths(new Date(), 1).toISOString().split('T')[0],
        createdAt: new Date().toISOString()
    });
    setDoc(taskRef, taskData).catch(() => {});

    updateProperty(propertyId, { units: property.units.map(u => u.name === unitName ? { ...u, status: 'rented' as UnitStatus } : u) });
    
    const appName = 'tenant-auth-worker';
    let secondaryApp;
    try { secondaryApp = getApp(appName); } catch (e) { secondaryApp = initializeApp(firebaseConfig, appName); }
    const secondaryAuth = getAuth(secondaryApp);
    try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, phone);
        await createUserProfile(cred.user.uid, email, 'tenant', { name, tenantId: tenantId, propertyId });
    } catch (e) {}
    cacheService.clear('tenants');
}

export async function addProperty(property: Omit<Property, 'id' | 'imageId'>): Promise<void> {
    const propRef = doc(collection(db, "properties"));
    const data = sanitizeData({ ...property, imageId: `property-${Math.floor(Math.random() * 3) + 1}` });
    setDoc(propRef, data).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: propRef.path,
                operation: 'create',
                requestResourceData: data,
            }));
        }
    });
    cacheService.clear('properties');
}

export async function updateProperty(propertyId: string, data: Partial<Property>): Promise<void> {
    const propRef = doc(db, 'properties', propertyId);
    const sanitizedData = sanitizeData(data);
    updateDoc(propRef, sanitizedData).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: propRef.path,
                operation: 'update',
                requestResourceData: sanitizedData,
            }));
        }
    });
    cacheService.clear('properties');
}

export async function updateTenant(tenantId: string, data: Partial<Tenant>): Promise<void> {
    const tenantRef = doc(db, 'tenants', tenantId);
    const sanitizedData = sanitizeData(data);
    updateDoc(tenantRef, sanitizedData)
        .then(() => {
            cacheService.clear('tenants');
            logActivity(`Updated tenant ${tenantId}`);
        })
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: tenantRef.path,
                    operation: 'update',
                    requestResourceData: sanitizedData
                }));
            }
        });
}

export async function addOrUpdateLandlord(landlord: Landlord, assignedUnitNames: string[]): Promise<void> {
    const landlordRef = doc(db, 'landlords', landlord.id);
    const sanitizedLandlord = sanitizeData(landlord);
    
    setDoc(landlordRef, sanitizedLandlord, { merge: true })
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: landlordRef.path,
                    operation: 'write',
                    requestResourceData: sanitizedLandlord,
                }));
            }
        });

    const allProps = await getProperties(true);
    const batch = writeBatch(db);
    allProps.forEach(p => {
        const newUnits = p.units.map(u => {
            if (u.ownership === 'Landlord') {
                if (assignedUnitNames.includes(u.name)) return { ...u, landlordId: landlord.id };
                if (u.landlordId === landlord.id) { const { landlordId: _, ...rest } = u; return rest; }
            }
            return u;
        });
        batch.update(doc(db, 'properties', p.id), { units: newUnits });
    });
    batch.commit().catch(() => {});
    cacheService.clear('properties');
    cacheService.clear('landlords');
}

export async function updatePropertyOwner(ownerId: string, data: Partial<PropertyOwner>): Promise<void> {
    const ownerRef = doc(db, 'propertyOwners', ownerId);
    const sanitizedData = sanitizeData(data);
    updateDoc(ownerRef, sanitizedData)
        .then(() => {
            cacheService.clear('propertyOwners');
            logActivity(`Updated property owner ${ownerId}`);
        })
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: ownerRef.path,
                    operation: 'update',
                    requestResourceData: sanitizedData
                }));
            }
        });
}

export async function deletePropertyOwner(ownerId: string): Promise<void> {
    const snap = await getDoc(doc(db, 'propertyOwners', ownerId));
    if (snap.exists()) {
        const data = snap.data() as PropertyOwner;
        const batch = writeBatch(db);
        batch.delete(snap.ref);
        if (data.userId) batch.update(doc(db, 'users', data.userId), { role: 'viewer', propertyOwnerId: deleteField() });
        batch.commit().catch(() => {});
        cacheService.clear('propertyOwners');
    }
}

export async function deleteLandlord(landlordId: string): Promise<void> {
    if (landlordId === 'soil_merchants_internal') throw new Error("Cannot delete internal profile.");
    const snap = await getDoc(doc(db, 'landlords', landlordId));
    if (!snap.exists()) return;
    const data = snap.data() as Landlord;
    const allProps = await getProperties();
    const batch = writeBatch(db);
    allProps.forEach(p => {
        const newUnits = p.units.map(u => u.landlordId === landlordId ? (({ landlordId: _, ...rest }) => rest)(u) : u);
        batch.update(doc(db, 'properties', p.id), { units: newUnits });
    });
    batch.delete(snap.ref);
    if (data.userId) batch.update(doc(db, 'users', data.userId), { role: 'viewer', landlordId: deleteField() });
    batch.commit().catch(() => {});
    cacheService.clear('landlords');
}

export async function createUserProfile(userId: string, email: string, role: UserProfile['role'], details: Partial<UserProfile> = {}) {
    const userRef = doc(db, 'users', userId);
    const data = sanitizeData({ email, role, ...details });
    setDoc(userRef, data, { merge: true }).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: userRef.path,
                operation: 'write',
                requestResourceData: data,
            }));
        }
    });
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const updateData = { role };
    updateDoc(userRef, updateData)
        .then(() => {
            cacheService.clear('userProfiles');
            logActivity(`Updated user role for ${userId} to ${role}`);
        })
        .catch(async (serverError: any) => {
            if (serverError.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: userRef.path,
                    operation: 'update',
                    requestResourceData: updateData
                }));
            }
        });
}

export async function updateMaintenanceRequestStatus(requestId: string, status: MaintenanceStatus) {
    const requestRef = doc(db, 'maintenanceRequests', requestId);
    const data = sanitizeData({ status, updatedAt: new Date().toISOString(), completedAt: (status === 'Completed' || status === 'Cancelled') ? new Date().toISOString() : undefined });
    updateDoc(requestRef, data).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: requestRef.path,
                operation: 'update',
                requestResourceData: data,
            }));
        }
    });
    cacheService.clear('maintenanceRequests');
}

export async function addTask(taskData: Omit<Task, 'id' | 'createdAt'>): Promise<void> {
    const taskRef = doc(collection(db, 'tasks'));
    const data = sanitizeData({ ...taskData, createdAt: new Date().toISOString() });
    setDoc(taskRef, data).catch(() => {});
    cacheService.clear('tasks');
}

export function listenToTasks(callback: (tasks: Task[]) => void): () => void {
    return onSnapshot(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')), (snap) => callback(snap.docs.map(d => postToJSON<Task>(d))));
}

export async function addNoticeToVacate(notice: Omit<NoticeToVacate, 'id'>) {
    const noticeRef = doc(collection(db, 'noticesToVacate'));
    const data = sanitizeData(notice);
    setDoc(noticeRef, data).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: noticeRef.path,
                operation: 'create',
                requestResourceData: data,
            }));
        }
    });
    cacheService.clear('noticesToVacate');
}

export async function getNoticesToVacate(): Promise<NoticeToVacate[]> {
    return getCollection<NoticeToVacate>(query(collection(db, 'noticesToVacate'), orderBy('scheduledMoveOutDate', 'desc')));
}

export async function processOverdueNotices(editorId: string) {
    const today = new Date();
    const snap = await getDocs(query(collection(db, 'noticesToVacate'), where('status', '==', 'Active')));
    const batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
        const n = d.data() as NoticeToVacate;
        if (new Date(n.scheduledMoveOutDate) < today) {
            batch.update(d.ref, { status: 'Completed' });
            batch.delete(doc(db, 'tenants', n.tenantId));
            count++;
        }
    }
    if (count > 0) {
        batch.commit().catch(() => {});
        cacheService.clear('tenants');
        cacheService.clear('noticesToVacate');
    }
    return { processedCount: count, errorCount: 0 };
}

export async function getAllMaintenanceRequestsForReport(): Promise<MaintenanceRequest[]> {
    return getCollection<MaintenanceRequest>(query(collection(db, 'maintenanceRequests'), orderBy('createdAt', 'desc')));
}

export async function getWaterReadingsAndTenants(readingIds: string[]): Promise<{ reading: WaterMeterReading, tenant: Tenant | null }[]> {
    const readings = await Promise.all(readingIds.map(id => getDocument<WaterMeterReading>('waterReadings', id)));
    const filteredReadings = readings.filter((r): r is WaterMeterReading => r !== null);
    const tenantIds = [...new Set(filteredReadings.map(r => r.tenantId))];
    const tenants = await Promise.all(tenantIds.map(id => getTenant(id)));
    const tenantMap = new Map(tenants.filter((t): t is Tenant => t !== null).map(t => [t.id, t]));
    return filteredReadings.map(reading => ({ reading, tenant: tenantMap.get(reading.tenantId) || null }));
}

export async function addMaintenanceUpdate(requestId: string, update: MaintenanceUpdate): Promise<void> {
    const ref = doc(db, 'maintenanceRequests', requestId);
    const updateData = { updates: arrayUnion(sanitizeData(update)), updatedAt: new Date().toISOString() };
    updateDoc(ref, updateData).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: ref.path,
                operation: 'update',
                requestResourceData: updateData,
            }));
        }
    });
    cacheService.clear('maintenanceRequests');
}

export async function addMaintenanceRequest(data: Omit<MaintenanceRequest, 'id' | 'createdAt' | 'updatedAt' | 'date' | 'status'>): Promise<void> {
    const now = new Date().toISOString();
    const requestRef = doc(collection(db, 'maintenanceRequests'));
    const requestData = sanitizeData({
        ...data,
        status: 'New' as MaintenanceStatus,
        date: now,
        createdAt: now,
        updatedAt: now,
        updates: [],
    });
    setDoc(requestRef, requestData).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: requestRef.path,
                operation: 'create',
                requestResourceData: requestData,
            }));
        }
    });
    cacheService.clear('maintenanceRequests');
}

export async function getTenantMaintenanceRequests(tenantId: string): Promise<MaintenanceRequest[]> {
    const q = query(collection(db, 'maintenanceRequests'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'));
    return getCollection<MaintenanceRequest>(q);
}

export async function addLandlordsFromCSV(data: any[]): Promise<{ added: number; skipped: number }> {
    const landlords = await getLandlords();
    const existingEmails = new Set(landlords.map(l => l.email.toLowerCase()));
    let added = 0;
    let skipped = 0;
    const batch = writeBatch(db);
    data.forEach(item => {
        if (existingEmails.has(item.email.toLowerCase())) {
            skipped++;
        } else {
            const id = `landlord_${Date.now()}_${added}`;
            const landlordRef = doc(db, 'landlords', id);
            batch.set(landlordRef, sanitizeData({ ...item, id }));
            added++;
        }
    });
    if (added > 0) batch.commit().catch(() => {});
    cacheService.clear('landlords');
    return { added, skipped };
}

export async function bulkUpdateUnitsFromCSV(propertyId: string, data: any[]): Promise<{ updatedCount: number; createdCount: number; errors: string[] }> {
    const property = await getProperty(propertyId);
    if (!property) throw new Error("Property not found.");
    const existingUnits = property.units || [];
    const updatedUnits = [...existingUnits];
    let updatedCount = 0;
    let createdCount = 0;
    const errors: string[] = [];
    data.forEach((row, index) => {
        const unitName = row.UnitName?.trim();
        if (!unitName) { errors.push(`Row ${index + 1}: Missing UnitName`); return; }
        const existingIndex = updatedUnits.findIndex(u => u.name === unitName);
        const unitData: Partial<Unit> = sanitizeData({
            name: unitName,
            status: (row.Status?.toLowerCase() || 'vacant') as UnitStatus,
            ownership: (row.Ownership || 'Landlord') as OwnershipType,
            unitType: (row.UnitType || 'Studio') as UnitType,
            unitOrientation: row.UnitOrientation as UnitOrientation,
            managementStatus: row.ManagementStatus as ManagementStatus,
            handoverStatus: (row.HandoverStatus || 'Pending Hand Over') as HandoverStatus,
            handoverDate: row.HandoverDate,
            rentAmount: row.RentAmount ? Number(row.RentAmount) : undefined,
            serviceCharge: row.ServiceCharge ? Number(row.ServiceCharge) : undefined,
            baselineReading: row.BaselineReading ? Number(row.BaselineReading) : undefined,
        });
        if (existingIndex > -1) { updatedUnits[existingIndex] = { ...updatedUnits[existingIndex], ...unitData }; updatedCount++; }
        else { updatedUnits.push(unitData as Unit); createdCount++; }
    });
    updateProperty(propertyId, { units: updatedUnits });
    return { updatedCount, createdCount, errors };
}

export async function getPropertyWaterReadings(propertyId: string): Promise<WaterMeterReading[]> {
    const q = query(collection(db, 'waterReadings'), where('propertyId', '==', propertyId), orderBy('date', 'desc'));
    return getCollection<WaterMeterReading>(q);
}

export async function getTenant(id: string): Promise<Tenant | null> {
    return cacheService.getOrFetch('tenants', id, () => getDocument<Tenant>('tenants', id), 60000);
}

export async function getAllWaterReadings(): Promise<WaterMeterReading[]> {
    return cacheService.getOrFetch('waterReadings', 'all', () => getCollection<WaterMeterReading>('waterReadings'), 300000);
}

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    return getCollection<ArchivedTenant>('archived_tenants', [orderBy('archivedAt', 'desc')]);
}

export async function getLatestWaterReading(propertyId: string, unitName: string): Promise<WaterMeterReading | null> {
    const q = query(collection(db, 'waterReadings'), where('propertyId', '==', propertyId), where('unitName', '==', unitName), orderBy('date', 'desc'), limit(1));
    const readings = await getCollection<WaterMeterReading>(q);
    return readings.length > 0 ? readings[0] : null;
}

export async function getLogs(): Promise<Log[]> {
    return getCollection<Log>(query(collection(db, 'logs'), orderBy('timestamp', 'desc')));
}

export async function getCommunications(): Promise<Communication[]> {
    return getCollection<Communication>(query(collection(db, 'communications'), orderBy('timestamp', 'desc')));
}
