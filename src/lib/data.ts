

import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import type { Property, Tenant, MaintenanceRequest, Unit, ArchivedTenant, UserProfile, WaterMeterReading, Payment, UnitType, OwnershipType, Log } from '@/lib/types';
import { db, firebaseConfig } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, arrayUnion, writeBatch, orderBy } from 'firebase/firestore';
import propertiesData from '../../backend.json';
import { auth } from './firebase';

const WATER_RATE = 150; // Ksh per unit

export async function logActivity(action: string) {
    const user = auth.currentUser;
    if (!user) return; // Don't log if user isn't authenticated

    try {
        await addDoc(collection(db, 'logs'), {
            userId: user.uid,
            action,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}

export async function getLogs(): Promise<Log[]> {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Log));
}

async function getCollection<T>(collectionName: string): Promise<T[]> {
  const q = query(collection(db, collectionName));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
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

export async function getProperties(): Promise<Property[]> {
  return Promise.resolve(propertiesData.properties as Property[]);
}

export async function getTenants(): Promise<Tenant[]> {
    return getCollection<Tenant>('tenants');
}

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    return getCollection<ArchivedTenant>('archived_tenants');
}

export async function getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
    return getCollection<MaintenanceRequest>('maintenanceRequests');
}

export async function getProperty(id: string): Promise<Property | null> {
    const property = propertiesData.properties.find(p => p.id === id);
    return Promise.resolve(property || null);
}

export async function getTenant(id: string): Promise<Tenant | null> {
    const tenant = await getDocument<Tenant>('tenants', id);
    if (tenant) {
        const readingsQuery = query(
            collection(db, 'waterReadings'), 
            where('tenantId', '==', id),
        );
        const readingsSnapshot = await getDocs(readingsQuery);
        const readings = readingsSnapshot.docs.map(doc => doc.data() as WaterMeterReading);
        readings.sort((a, b) => (b.createdAt as any) - (a.createdAt as any));
        tenant.waterReadings = readings.slice(0, 12);
    }
    return tenant;
}

export async function addTenant({
  name,
  email,
  phone,
  idNumber,
  propertyId,
  unitName,
  agent,
  rent,
  securityDeposit
}: Omit<Tenant, 'id' | 'status' | 'lease'> & { rent: number; securityDeposit: number }): Promise<void> {

    const newTenantData = {
        name,
        email,
        phone,
        idNumber,
        propertyId,
        unitName,
        agent,
        status: 'active' as const,
        lease: {
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            rent: rent || 0,
            paymentStatus: 'Pending' as const
        },
        securityDeposit: securityDeposit || 0,
    };
    const tenantDocRef = await addDoc(collection(db, 'tenants'), newTenantData);
    
    await logActivity(`Created tenant: ${name} (${email})`);

    const appName = 'tenant-creation-app-' + newTenantData.email;
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

    } catch (error) {
        console.error("Error creating tenant auth user:", error);
        throw new Error("Failed to create tenant login credentials.");
    } finally {
        if (secondaryApp) {
            await deleteApp(secondaryApp);
        }
    }
}

export async function addProperty(property: Omit<Property, 'id' | 'imageId'>): Promise<void> {
    console.log("Adding properties is not fully supported when using local JSON data.");
}

export async function updateProperty(propertyId: string, data: Partial<Property>): Promise<void> {
    console.log("Updating properties is not fully supported when using local JSON data.");
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
        
        await logActivity(`Archived tenant: ${tenant.name}`);
        console.log(`Unit ${tenant.unitName} in property ${tenant.propertyId} should be marked as vacant.`);
    }
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    const oldTenant = await getTenant(tenantId);
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, tenantData);
    
    await logActivity(`Updated tenant: ${tenantData.name || oldTenant?.name}`);

    if (oldTenant && (oldTenant.propertyId !== tenantData.propertyId || oldTenant.unitName !== tenantData.unitName)) {
        console.log(`Unit ${oldTenant.unitName} in property ${oldTenant.propertyId} should be marked as vacant.`);
        if (tenantData.propertyId && tenantData.unitName) {
            console.log(`Unit ${tenantData.unitName} in property ${tenantData.propertyId} should be marked as rented.`);
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
        if (userProfile.role === 'tenant' && userProfile.tenantId) {
            const tenantData = await getTenant(userProfile.tenantId);
            if (tenantData) {
                userProfile.tenantDetails = tenantData;
            }
        }
        return userProfile;
    }
    return null;
}

export async function addMaintenanceRequest(request: Omit<MaintenanceRequest, 'id' | 'date' | 'status' | 'createdAt'>) {
    await addDoc(collection(db, 'maintenanceRequests'), {
        ...request,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        status: 'New',
    });
    await logActivity(`Submitted maintenance request`);
}

export async function getTenantMaintenanceRequests(tenantId: string): Promise<MaintenanceRequest[]> {
    const q = query(
        collection(db, "maintenanceRequests"), 
        where("tenantId", "==", tenantId)
    );
    const querySnapshot = await getDocs(q);
    const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
    
    requests.sort((a, b) => (b.createdAt as any) - (a.createdAt as any));

    return requests;
}

export async function addWaterMeterReading(data: {
    propertyId: string;
    unitName: string;
    priorReading: number;
    currentReading: number;
}) {
    const tenantsSnapshot = await getDocs(query(collection(db, 'tenants'), where('propertyId', '==', data.propertyId), where('unitName', '==', data.unitName)));
    if (tenantsSnapshot.empty) {
        throw new Error("Tenant not found for the selected unit.");
    }
    const tenantDoc = tenantsSnapshot.docs[0];
    const tenantId = tenantDoc.id;

    const consumption = data.currentReading - data.priorReading;
    const amount = consumption * WATER_RATE;

    const readingData = {
        ...data,
        tenantId,
        consumption,
        rate: WATER_RATE,
        amount,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
    };
    
    const readingRef = await addDoc(collection(db, 'waterReadings'), readingData);
    
    await logActivity(`Added water reading for unit ${data.unitName}`);
    
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
        waterReadings: arrayUnion({ ...readingData, id: readingRef.id })
    });
}

export async function addPayment(paymentData: Omit<Payment, 'id' | 'createdAt'>) {
    const tenantRef = doc(db, 'tenants', paymentData.tenantId);
    const tenantSnap = await getDoc(tenantRef);

    if (!tenantSnap.exists()) {
        throw new Error("Tenant not found");
    }

    const tenant = tenantSnap.data() as Tenant;

    const payment = {
        ...paymentData,
        createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'payments'), payment);
    await logActivity(`Added payment of ${paymentData.amount} for tenant ${tenant.name}`);

    let newLeaseData = {};
    if (payment.amount >= tenant.lease.rent) {
        newLeaseData = {
            'lease.paymentStatus': 'Paid',
            'lease.lastPaymentDate': paymentData.date,
        };
    }
     await updateDoc(tenantRef, newLeaseData);

    const updatedTenantSnap = await getDoc(tenantRef);
    const updatedTenant = updatedTenantSnap.data() as Tenant;
    const lastPayment = updatedTenant.lease.lastPaymentDate ? new Date(updatedTenant.lease.lastPaymentDate) : new Date(0);
    const today = new Date();

    if (lastPayment.getMonth() !== today.getMonth() || lastPayment.getFullYear() !== today.getFullYear()) {
         const newStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
         const newEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        if(updatedTenant.lease.paymentStatus === 'Paid'){
             await updateDoc(tenantRef, {
                'lease.paymentStatus': 'Pending',
                'lease.startDate': newStartDate.toISOString().split('T')[0],
                'lease.endDate': newEndDate.toISOString().split('T')[0],
            });
        }
    }
}

export async function updateUnitTypesFromCSV(data: { PropertyName: string; UnitName: string; UnitType: string }[]): Promise<number> {
    console.log("Updating from CSV is not fully supported when using local JSON data.");
    return 0;
}
