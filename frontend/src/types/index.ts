import type { VehicleLike } from '../components/VehicleForm';
export interface User {
  id: string;
  /** 登入帳號（Email 或自訂帳號） */
  email: string;
  name: string;
  role?: 'ADMIN' | 'STAFF';
  permissions?: string[];
  ownerId?: string | null;
  active?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  description?: string;
  units: Unit[];
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  floor?: number | null;
  type?: string | null;
  monthlyRent: number;
  status: 'VACANT' | 'OCCUPIED';
  vehicleKind?: VehicleKind | null;
  spotType?: SpotType | null;
  maxHeightCm?: number | null;
  maxWidthCm?: number | null;
  hasCharger?: boolean;
  dailyRate?: number | string | null;
  weeklyRate?: number | string | null;
  contracts?: Contract[];
  maintenanceRequests?: MaintenanceRequest[];
}

export type VehicleKind = 'CAR' | 'MOTORCYCLE' | 'OTHER';
export type SpotType = 'FLAT' | 'MECHANICAL_UPPER' | 'MECHANICAL_LOWER' | 'OTHER';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'SHORT_TERM';

export interface WaitlistEntry {
  id: string;
  propertyId?: string | null;
  tenantId?: string | null;
  name: string;
  phone: string;
  vehicleKind?: VehicleKind | null;
  spotType?: SpotType | null;
  needCharger: boolean;
  vehicleHeightCm?: number | null;
  notes?: string | null;
  status: 'WAITING' | 'NOTIFIED' | 'FULFILLED' | 'CANCELLED';
  notifiedAt?: string | null;
  createdAt: string;
  property?: { id: string; name: string } | null;
  tenant?: { id: string; name: string; lineBound: boolean } | null;
  notifiedUnit?: { id: string; unitNumber: string; property: { name: string } } | null;
  matchingUnits: Array<{ id: string; unitNumber: string; propertyName: string; monthlyRent: number | string }>;
}

export interface Tenant {
  id: string;
  name: string;
  phone: string;
  email?: string;
  idNumber?: string;
  emergencyContact?: string;
  lineUserId?: string;
  lineDisplayName?: string;
  lineBindingCode?: string;
  lineBindingCodeExpiry?: string;
  lineBoundAt?: string;
  contracts?: Array<Contract & { unit?: { unitNumber: string } }>;
  vehicles?: VehicleLike[];
}

export interface Contract {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  depositPaid: boolean;
  rentDueDay: number;
  billingCycle?: BillingCycle;
  periodAmount?: number | string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  notes?: string;
  vehicleId?: string | null;
  vehicle?: VehicleLike | null;
  accessCard?: string | null;
  accessCardDeposit?: string | number | null;
  accessCardReturned?: boolean;
  signToken?: string;
  signedAt?: string;
  signerName?: string;
  unit?: Unit & { property?: Property };
  tenant?: Tenant;
  rentRecords?: RentRecord[];
  depositRefund?: DepositRefund;
}

export interface RentRecord {
  id: string;
  contractId: string;
  year: number;
  month: number;
  dueDate: string;
  amount: number;
  paidDate?: string;
  paidAmount?: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';
  paymentMethod?: string;
  notes?: string;
  contract?: Contract & { tenant?: Tenant; unit?: Unit & { property?: Property } };
}

export interface MaintenanceRequest {
  id: string;
  unitId: string;
  tenantId?: string;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  reportedAt: string;
  resolvedAt?: string;
  cost?: number;
  notes?: string;
  unit?: Unit & { property?: Property };
  tenant?: Tenant;
}

export interface Expense {
  id: string;
  propertyId?: string;
  unitId?: string;
  category: 'WATER' | 'ELECTRICITY' | 'GAS' | 'MANAGEMENT' | 'REPAIR' | 'INSURANCE' | 'INTERNET' | 'OTHER';
  amount: number;
  date: string;
  description?: string;
  confirmedAt?: string;
  property?: { name: string };
  unit?: { unitNumber: string };
}

export type DepositRefundStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED';

export interface DepositDeduction {
  id: string;
  description: string;
  amount: number;
  category: 'REPAIR' | 'CLEANING' | 'UTILITY' | 'OTHER';
}

export interface DepositRefund {
  id: string;
  contractId: string;
  depositAmount: number;
  totalDeductions: number;
  refundAmount: number;
  status: DepositRefundStatus;
  refundDate?: string;
  notes?: string;
  notifiedAt?: string;
  deductions: DepositDeduction[];
}

export interface DashboardData {
  rentSummary: {
    year: number;
    month: number;
    totalRent: number;
    collectedRent: number;
    collectionRate: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
    overdueAmount: number;
    overdueTotal: number;
  };
  occupancy: { total: number; occupied: number; rate: number };
  pendingMaintenance: number;
  totalTodos: number;
  operationSummary: string;
  autoNotifyEnabled: boolean;
  trendData: Array<{ month: string; expected: number; collected: number }>;
  expiringContracts: Array<{ id: string; tenantName: string; unitNumber: string; endDate: string; daysLeft: number }>;
  overdueRecords: Array<{ id: string; tenantName: string; unitNumber: string; amount: number; daysOverdue: number }>;
}
