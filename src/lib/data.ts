
import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import type { Property, Tenant, MaintenanceRequest, Unit, ArchivedTenant, UserProfile, WaterMeterReading, Payment } from '@/lib/types';
import { db, firebaseConfig } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, orderBy, limit, arrayUnion } from 'firebase/firestore';

const WATER_RATE = 150; // Ksh per unit

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
  return getCollection<Property>('properties');
}

export async function getTenants(): Promise<Tenant[]> {
    const q = query(collection(db, "tenants"), where("status", "!=", "archived"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
}

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    const q = query(collection(db, "tenants"), where("status", "==", "archived"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArchivedTenant));
}

export async function getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
    const q = query(collection(db, "maintenanceRequests"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
}

export async function getProperty(id: string): Promise<Property | null> {
    return getDocument<Property>('properties', id);
}

export async function getTenant(id: string): Promise<Tenant | null> {
    const tenant = await getDocument<Tenant>('tenants', id);
    if (tenant) {
        const readingsQuery = query(
            collection(db, 'waterReadings'), 
            where('tenantId', '==', id),
            limit(12)
        );
        const readingsSnapshot = await getDocs(readingsQuery);
        const readings = readingsSnapshot.docs.map(doc => doc.data() as WaterMeterReading);
        // Sort in-memory to avoid needing a composite index
        readings.sort((a, b) => (b.createdAt as any) - (a.createdAt as any));
        tenant.waterReadings = readings;
    }
    return tenant;
}

export async function addTenant(tenantData: Omit<Tenant, 'id' | 'lease' | 'status'>): Promise<void> {
    const newTenantData = {
        ...tenantData,
        status: 'active' as const,
        lease: {
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            rent: tenantData.rent || 0,
            paymentStatus: 'Pending' as const
        },
    };
    const tenantDocRef = await addDoc(collection(db, 'tenants'), newTenantData);
    
    // Mark unit as rented
    const property = await getProperty(tenantData.propertyId);
    if (property && property.units) {
        const updatedUnits = property.units.map(unit => 
            unit.name === tenantData.unitName ? { ...unit, status: 'rented' as const } : unit
        );
        const propertyRef = doc(db, 'properties', tenantData.propertyId);
        await updateDoc(propertyRef, { units: updatedUnits });
    }

    // Create Firebase Auth user for the tenant
    const appName = 'tenant-creation-app-' + newTenantData.email;
    let secondaryApp;
    try {
        secondaryApp = getApp(appName);
    } catch (e) {
        secondaryApp = initializeApp(firebaseConfig, appName);
    }

    const secondaryAuth = getAuth(secondaryApp);
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, tenantData.email, tenantData.unitName);
        const user = userCredential.user;

        // Create user profile in Firestore
        await createUserProfile(user.uid, user.email || tenantData.email, 'tenant', { 
            name: tenantData.name, 
            tenantId: tenantDocRef.id,
            propertyId: tenantData.propertyId
        });

    } catch (error) {
        console.error("Error creating tenant auth user:", error);
        // If auth user creation fails, we should ideally roll back the tenant creation.
        // For now, we'll log the error.
        throw new Error("Failed to create tenant login credentials.");
    } finally {
        await deleteApp(secondaryApp);
    }
}

export async function addProperty(property: Omit<Property, 'id' | 'units' | 'imageId'> & { units: string }): Promise<void> {
    const { units, ...propertyData } = property;
    const unitArray = units.split(',')
        .map(name => name.trim())
        .filter(name => name)
        .map(name => ({ name, status: 'vacant' as const, managementType: 'owner' as const }));
    const imageId = Math.floor(Math.random() * 3 + 1).toString();
    await addDoc(collection(db, 'properties'), { ...propertyData, units: unitArray, imageId: `property-${imageId}` });
}

export async function updateProperty(propertyId: string, propertyData: Partial<Property>): Promise<void> {
    const propertyRef = doc(db, 'properties', propertyId);
    await updateDoc(propertyRef, propertyData);
}

export async function archiveTenant(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (tenant) {
        const tenantRef = doc(db, 'tenants', tenantId);
        await updateDoc(tenantRef, { 
            status: 'archived',
            archivedAt: new Date().toISOString()
        });

        const property = await getProperty(tenant.propertyId);
        if (property && property.units) {
            const updatedUnits = property.units.map(unit =>
                unit.name === tenant.unitName ? { ...unit, status: 'vacant' } : unit
            );
            const propertyRef = doc(db, 'properties', tenant.propertyId);
            await updateDoc(propertyRef, { units: updatedUnits });
        }
    }
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    const oldTenant = await getTenant(tenantId);
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, tenantData);

    if (oldTenant && (oldTenant.propertyId !== tenantData.propertyId || oldTenant.unitName !== tenantData.unitName)) {
        const oldProperty = await getProperty(oldTenant.propertyId);
        if (oldProperty && oldProperty.units) {
            const updatedOldUnits = oldProperty.units.map(unit =>
                unit.name === oldTenant.unitName ? { ...unit, status: 'vacant' } : unit
            );
            const oldPropertyRef = doc(db, 'properties', oldTenant.propertyId);
            await updateDoc(oldPropertyRef, { units: updatedOldUnits });
        }

        if (tenantData.propertyId && tenantData.unitName) {
            const newProperty = await getProperty(tenantData.propertyId);
            if (newProperty && newProperty.units) {
                const updatedNewUnits = newProperty.units.map(unit =>
                    unit.name === tenantData.unitName ? { ...unit, status: 'rented' } : unit
                );
                const newPropertyRef = doc(db, 'properties', tenantData.propertyId);
                await updateDoc(newPropertyRef, { units: updatedNewUnits });
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
}

export async function getTenantMaintenanceRequests(tenantId: string): Promise<MaintenanceRequest[]> {
    const q = query(
        collection(db, "maintenanceRequests"), 
        where("tenantId", "==", tenantId)
    );
    const querySnapshot = await getDocs(q);
    const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
    
    // Sort in-memory to avoid needing a composite index
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
    
    // Also update the tenant's subcollection for easy retrieval
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

    // Add to payments collection
    await addDoc(collection(db, 'payments'), payment);

    // Update tenant's payment status
    if (payment.amount >= tenant.lease.rent) {
        await updateDoc(tenantRef, {
            'lease.paymentStatus': 'Paid'
        });
    }
}
