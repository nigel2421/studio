
import { initializeApp, getApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { cacheService } from './cache';
import {
    Property, Unit, WaterMeterReading, Payment, Tenant,
    ArchivedTenant, MaintenanceRequest, UserProfile, Log, Landlord,
    UserRole, UnitStatus, PropertyOwner, FinancialDocument, ServiceChargeStatement, Communication, Task, UnitType,
    unitStatuses, ownershipTypes, unitTypes, managementStatuses, handoverStatuses, UnitOrientation, unitOrientations, Agent,
    NoticeToVacate, MaintenanceStatus, MaintenanceUpdate, OwnershipType, ManagementStatus, HandoverStatus
} from './types';
import { db, firebaseConfig, sendPaymentReceipt } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, arrayUnion, writeBatch, orderBy, deleteDoc, limit, onSnapshot, runTransaction, collectionGroup, deleteField, startAfter, DocumentSnapshot, Query, documentId } from 'firebase/firestore';
import { auth } from './firebase';
import { reconcileMonthlyBilling, processPayment, validatePayment, getRecommendedPaymentStatus, generateLedger } from './financial-logic';
import { format, startOfMonth, addMonths, parseISO } from "date-fns";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const WATER_RATE = 150; 

function postToJSON<T>(doc: DocumentSnapshot): T {
    const data = doc.data();
    if (!data) return { id: doc.id } as T;
    const convertObjectTimestamps = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
        if (Array.isArray(obj)) return obj.map(convertObjectTimestamps);
        const newObj: { [key: string]: any } = {};
        for (const key of Object.keys(obj)) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = convertObjectTimestamps(obj[key]);
        }
        return newObj;
    };
    const serializedData = convertObjectTimestamps(data);
    return { id: doc.id, ...serializedData } as T;
}

export async function logActivity(action: string, userEmail?: string | null) {
    const user = auth.currentUser;
    if (!user && !userEmail) return;
    const activityData = { userId: user?.uid || 'system', userEmail: user?.email || userEmail || 'system', action, timestamp: new Date().toISOString() };
    addDoc(collection(db, 'logs'), activityData).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'logs', operation: 'create', requestResourceData: activityData }));
        }
    });
}

export async function logCommunication(data: Omit<Communication, 'id'>) {
    const commData = { ...data, timestamp: new Date().toISOString() };
    addDoc(collection(db, 'communications'), commData).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'communications', operation: 'create', requestResourceData: commData }));
        }
    });
}

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
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path, operation: 'list' }));
        }
        throw serverError;
    }
}

async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
    const docRef = doc(db, collectionName, id);
    try {
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? postToJSON<T>(docSnap) : null;
    } catch (serverError: any) {
        if (serverError.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `${collectionName}/${id}`, operation: 'get' }));
        }
        throw serverError;
    }
}

async function getAllUsers(): Promise<UserProfile[]> {
    return cacheService.getOrFetch('users', 'all', () => getCollection<UserProfile>('users'), 300000);
}

export async function getProperties(forceRefresh = false): Promise<Property[]> {
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
    }, 300000);
}

export async function getLandlords(): Promise<Landlord[]> {
    return cacheService.getOrFetch('landlords', 'all', () => getCollection<Landlord>('landlords'), 300000);
}

export async function getPropertyOwners(): Promise<PropertyOwner[]> {
    return cacheService.getOrFetch('propertyOwners', 'all', () => getCollection<PropertyOwner>('propertyOwners'), 300000);
}

export async function getUsers(options: { searchQuery?: string; roleFilters?: UserRole[]; page?: number; pageSize?: number; } = {}): Promise<{ users: UserProfile[]; totalCount: number }> {
    const { searchQuery = '', roleFilters = [], page = 1, pageSize = 10 } = options;
    const [allUsers, properties, landlords, propertyOwners] = await Promise.all([getAllUsers(), getProperties(), getLandlords(), getPropertyOwners()]);
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

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
    const userRef = doc(db, 'users', userId);
    updateDoc(userRef, { role }).then(() => {
        cacheService.clear('users');
        logActivity(`Updated role for user ID ${userId} to ${role}`);
    }).catch(async (serverError: any) => {
        if (serverError.code === 'permission-denied') errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `users/${userId}`, operation: 'update', requestResourceData: { role } }));
        throw serverError;
    });
}

export async function getLogs(): Promise<Log[]> {
    return cacheService.getOrFetch('logs', 'all', () => {
        const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(1000));
        return getCollection<Log>(q);
    }, 120000);
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

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    return cacheService.getOrFetch('archived_tenants', 'all', () => getCollection<ArchivedTenant>('archived_tenants'), 300000);
}

export async function getCommunications(): Promise<Communication[]> {
    const q = query(collection(db, 'communications'), orderBy('timestamp', 'desc'), limit(50));
    return getCollection<Communication>(q);
}

export async function getMaintenanceRequests(options: { propertyId?: string } = {}): Promise<MaintenanceRequest[]> {
    const { propertyId } = options;
    return cacheService.getOrFetch('maintenanceRequests', propertyId ? `prop-${propertyId}-last90` : 'all', async () => {
        const constraints: any[] = [orderBy('createdAt', 'desc')];
        if (propertyId) constraints.unshift(where('propertyId', '==', propertyId));
        return getCollection<MaintenanceRequest>(query(collection(db, 'maintenanceRequests'), ...constraints));
    }, 60000);
}

export async function getProperty(id: string): Promise<Property | null> {
    return cacheService.getOrFetch('properties', id, () => getDocument<Property>('properties', id), 60000);
}

export async function getTenantWaterReadings(tenantId: string): Promise<WaterMeterReading[]> {
    if (!tenantId) return [];
    return cacheService.getOrFetch('waterReadings', `tenant-${tenantId}`, () => {
        const q = query(collection(db, 'waterReadings'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'));
        return getCollection<WaterMeterReading>(q);
    }, 120000);
}

export async function getAllWaterReadings(): Promise<WaterMeterReading[]> {
    return cacheService.getOrFetch('waterReadings', 'all', async () => {
        const q = query(collectionGroup(db, 'waterReadings'), orderBy('date', 'desc'));
        return getCollection<WaterMeterReading>(q);
    }, 120000); 
}

export async function getLatestWaterReading(propertyId: string, unitName: string): Promise<WaterMeterReading | null> {
    const q = query(collection(db, 'waterReadings'), where('propertyId', '==', propertyId), where('unitName', '==', unitName), orderBy('date', 'desc'), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : postToJSON<WaterMeterReading>(snap.docs[0]);
}

export async function getTenant(id: string): Promise<Tenant | null> {
    return cacheService.getOrFetch('tenants', id, () => getDocument<Tenant>('tenants', id), 60000);
}

export async function getPayment(id: string): Promise<Payment | null> {
    return cacheService.getOrFetch('payments', id, () => getDocument<Payment>('payments', id), 60000);
}

export async function getAllPaymentsForReport(): Promise<Payment[]> {
    return cacheService.getOrFetch('payments', 'all-report', () => getCollection<Payment>(query(collection(db, 'payments'), orderBy('date', 'desc'))), 300000);
}

export async function addTenant(data: { name: string; email: string; phone: string; idNumber: string; propertyId: string; unitName: string; agent: Agent; rent: number; securityDeposit: number; waterDeposit?: number; residentType: 'Tenant' | 'Homeowner'; leaseStartDate: string; }): Promise<void> {
    const { name, email, phone, idNumber, propertyId, unitName, agent, rent, securityDeposit, waterDeposit, leaseStartDate, residentType } = data;
    const property = await getProperty(propertyId);
    if (!property) throw new Error("Property not found.");
    const unit = property.units.find(u => u.name === unitName);
    if (!unit) throw new Error("Unit not found.");
    const initialDue = rent + (securityDeposit || 0) + (waterDeposit || 0);
    const newTenantData = { name, email, phone, idNumber, propertyId, unitName, agent, status: 'active' as const, residentType, lease: { startDate: leaseStartDate, endDate: addMonths(new Date(leaseStartDate), 12).toISOString().split('T')[0], rent, serviceCharge: unit.serviceCharge || 0, paymentStatus: 'Pending' as const, lastBilledPeriod: format(new Date(leaseStartDate), 'yyyy-MM') }, securityDeposit: securityDeposit || 0, waterDeposit: waterDeposit || 0, dueBalance: initialDue, accountBalance: 0 };
    const docRef = await addDoc(collection(db, 'tenants'), newTenantData);
    addTask({ title: `Onboard: ${name}`, description: `Onboarding pending for ${name}. Balance: Ksh ${initialDue.toLocaleString()}`, status: 'Pending', priority: 'High', category: 'Financial', tenantId: docRef.id, propertyId, unitName, dueDate: addDays(new Date(), 7).toISOString().split('T')[0] });
    updateProperty(propertyId, { units: property.units.map(u => u.name === unitName ? { ...u, status: 'rented' as UnitStatus } : u) });
    const appName = 'tenant-auth-worker';
    let secondaryApp;
    try { secondaryApp = getApp(appName); } catch (e) { secondaryApp = initializeApp(firebaseConfig, appName); }
    const secondaryAuth = getAuth(secondaryApp);
    try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, phone);
        await createUserProfile(cred.user.uid, email, 'tenant', { name, tenantId: docRef.id, propertyId });
    } catch (e) {}
    cacheService.clear('tenants');
}

export async function addProperty(property: Omit<Property, 'id' | 'imageId'>): Promise<void> {
    const data = { ...property, imageId: `property-${Math.floor(Math.random() * 3) + 1}` };
    addDoc(collection(db, "properties"), data);
    cacheService.clear('properties');
}

export async function updateProperty(propertyId: string, data: Partial<Property>): Promise<void> {
    updateDoc(doc(db, 'properties', propertyId), data);
    cacheService.clear('properties');
}

export async function addOrUpdateLandlord(landlord: Landlord, assignedUnitNames: string[]): Promise<void> {
    setDoc(doc(db, 'landlords', landlord.id), landlord, { merge: true });
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
    batch.commit();
    cacheService.clear('properties');
    cacheService.clear('landlords');
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
    batch.commit();
    cacheService.clear('tenants');
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    updateDoc(doc(db, 'tenants', tenantId), tenantData);
    cacheService.clear('tenants');
}

export async function updatePropertyOwner(ownerId: string, data: Partial<PropertyOwner>): Promise<void> {
    updateDoc(doc(db, 'propertyOwners', ownerId), data);
    cacheService.clear('propertyOwners');
}

export async function deletePropertyOwner(ownerId: string): Promise<void> {
    const snap = await getDoc(doc(db, 'propertyOwners', ownerId));
    if (snap.exists()) {
        const data = snap.data() as PropertyOwner;
        const batch = writeBatch(db);
        batch.delete(snap.ref);
        if (data.userId) batch.update(doc(db, 'users', data.userId), { role: 'viewer', propertyOwnerId: deleteField() });
        batch.commit();
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
    batch.commit();
    cacheService.clear('landlords');
}

export async function createUserProfile(userId: string, email: string, role: UserProfile['role'], details: Partial<UserProfile> = {}) {
    setDoc(doc(db, 'users', userId), { email, role, ...details }, { merge: true });
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

export async function updateMaintenanceRequestStatus(requestId: string, status: MaintenanceStatus) {
    const data = { status, updatedAt: new Date().toISOString(), completedAt: (status === 'Completed' || status === 'Cancelled') ? new Date().toISOString() : undefined };
    updateDoc(doc(db, 'maintenanceRequests', requestId), data);
    cacheService.clear('maintenanceRequests');
}

export async function addWaterMeterReading(data: { propertyId: string; unitName: string; priorReading: number; currentReading: number; date: string; }) {
    const property = await getProperty(data.propertyId);
    if (!property) throw new Error("Property not found.");
    const unit = property.units.find(u => u.name === data.unitName);
    const tenantsSnap = await getDocs(query(collection(db, 'tenants'), where('propertyId', '==', data.propertyId), where('unitName', '==', data.unitName), limit(1)));
    if (tenantsSnap.empty) throw new Error("No resident found for this unit.");
    const tenant = { id: tenantsSnap.docs[0].id, ...tenantsSnap.docs[0].data() } as Tenant;
    const consumption = data.currentReading - data.priorReading;
    const amount = consumption * WATER_RATE;
    await addDoc(collection(db, 'waterReadings'), { ...data, tenantId: tenant.id, consumption, rate: WATER_RATE, amount, createdAt: serverTimestamp(), status: 'Pending' });
    cacheService.clear('waterReadings');
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
            tx.set(payRef, { tenantId, ...entry, status: 'Paid', createdAt: new Date().toISOString() });
            if (entry.type === 'Water' && entry.waterReadingId) tx.update(doc(db, 'waterReadings', entry.waterReadingId), { status: 'Paid', paymentId: payRef.id });
            const updates = processPayment(workingTenant, entry.amount, entry.type, new Date(entry.date));
            Object.assign(workingTenant, updates);
        }
        tx.update(tenantRef, { dueBalance: workingTenant.dueBalance, accountBalance: workingTenant.accountBalance, 'lease.paymentStatus': workingTenant.lease.paymentStatus });
    });

    if (taskId) updateDoc(doc(db, 'tasks', taskId), { status: 'Completed' });
    cacheService.clear('tenants');
    cacheService.clear('payments');
}

export async function forceRecalculateTenantBalance(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (!tenant) return;
    const [payments, prop] = await Promise.all([getPaymentHistory(tenantId), getProperty(tenant.propertyId)]);
    if (!prop) return;
    const { finalDueBalance, finalAccountBalance } = generateLedger(tenant, payments, [prop], [], null, new Date(), { includeWater: false });
    await updateDoc(doc(db, 'tenants', tenantId), { dueBalance: finalDueBalance, accountBalance: finalAccountBalance, 'lease.paymentStatus': getRecommendedPaymentStatus({ dueBalance: finalDueBalance }) });
    cacheService.clear('tenants');
}

export async function addTask(taskData: Omit<Task, 'id' | 'createdAt'>): Promise<void> {
    addDoc(collection(db, 'tasks'), { ...taskData, createdAt: new Date().toISOString() });
    cacheService.clear('tasks');
}

export async function updatePayment(paymentId: string, data: Partial<Payment>, reason: string, editorId: string): Promise<void> {
    const snap = await getDoc(doc(db, 'payments', paymentId));
    if (!snap.exists()) return;
    const orig = snap.data() as Payment;
    updateDoc(snap.ref, { ...data, editHistory: arrayUnion({ editedAt: new Date().toISOString(), editedBy: editorId, reason, previousValues: { amount: orig.amount, date: orig.date, notes: orig.notes } }) });
    cacheService.clear('payments');
}

export function listenToTasks(callback: (tasks: Task[]) => void): () => void {
    return onSnapshot(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')), (snap) => callback(snap.docs.map(d => postToJSON<Task>(d))));
}

export async function addNoticeToVacate(notice: Omit<NoticeToVacate, 'id'>) {
    addDoc(collection(db, 'noticesToVacate'), notice);
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
        await batch.commit();
        cacheService.clear('tenants');
        cacheService.clear('noticesToVacate');
    }
    return { processedCount: count, errorCount: 0 };
}
