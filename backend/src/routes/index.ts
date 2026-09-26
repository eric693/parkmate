import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { listModules, listUsers, createUser, updateUser, deleteUser } from '../controllers/userController';
import { requireTenant } from '../middleware/tenantAuth';
import {
  getPrepaidOverview, getPrepaidCandidates, updatePrepaidConfig,
  postTopUp, postUsage, postAdjust, getPrepaidRecords, triggerPrepaidCheck,
} from '../controllers/prepaidController';
import {
  getNotificationRules, updateNotificationRule, triggerNotificationRule,
} from '../controllers/notificationRuleController';
import {
  getContractDocument, updateContractDocument, resetContractDocument,
  sendContractDocument, previewDocument, getDocumentByToken,
  getTemplates, createTemplate, deleteTemplate,
} from '../controllers/contractDocumentController';
import { getTodayRentAlerts, getRentUtilityStats, getDormRecords } from '../controllers/rentAlertController';
import {
  createRentRecord, updateRentRecord, deleteRentRecord, deleteContract, deleteMaintenanceRequest,
  updateExpense, updateUtilityBill, deleteUtilityBill, updatePrepaidRecord, deletePrepaidRecord,
  updateContractTemplate, deletePayment, getDataSummary, wipeAllData,
} from '../controllers/crudController';
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from '../controllers/vehicleController';
import { register, login, me, updateMe } from '../controllers/authController';
import { getDashboard } from '../controllers/dashboardController';
import { getProperties, createProperty, updateProperty, deleteProperty } from '../controllers/propertyController';
import { getUnits, createUnit, updateUnit, deleteUnit } from '../controllers/unitController';
import { getTenants, createTenant, updateTenant, deleteTenant, generateTenantBindingCode } from '../controllers/tenantController';
import { getContracts, createContract, updateContract, generateSignInvite, getContractByToken, signContractByToken } from '../controllers/contractController';
import { getDepositRefund, upsertDepositRefund, confirmRefund, notifyTenantRefund } from '../controllers/depositRefundController';
import { getVacantUnits, addListing, updateListing, deleteListing } from '../controllers/listingController';
import { getReminderSettings, updateReminderSettings, triggerReminders } from '../controllers/reminderController';
import { getRentRecords, confirmPayment, markOverdue, sendReminder } from '../controllers/rentController';
import { getMaintenanceRequests, createMaintenanceRequest, updateMaintenanceRequest } from '../controllers/maintenanceController';
import { getExpenses, createExpense, deleteExpense, confirmExpense, getExpenseTrend } from '../controllers/expenseController';
import { webhook, getLandlordBinding, generateLandlordBindingCode, unbindLandlord, getTenantBindings } from '../controllers/lineController';
import { getCalendarEvents } from '../controllers/calendarController';
import { getCollectionWorkbench, getFinanceOverview } from '../controllers/collectionWorkbenchController';
import { getROIAnalysis } from '../controllers/roiController';
import { exportTaxReport } from '../controllers/taxExportController';
import {
  getPayments, getUnmatchedPayments, matchPayment, getContractVirtualAccount,
  paymentWebhook, simulatePayment, getMatchSuggestions,
} from '../controllers/paymentController';
import { checkCompliance } from '../controllers/contractController';
import { analyzeMaintenanceRequest } from '../controllers/maintenanceController';
import { taxPrecheck } from '../controllers/taxExportController';
import { assistantChat, getFinancialInsights, draftClauses } from '../controllers/aiController';
import {
  getHandovers, createHandover, updateHandover, sendHandoverForConfirmation,
  getHandoverByToken, confirmHandoverByToken, tenantHandovers, tenantConfirmHandover,
} from '../controllers/handoverController';
import {
  previewUtilitySplit, createUtilityBill, getUtilityBills, billUtilityToTenants,
} from '../controllers/utilityBillController';
import { getTenantCredit, getTenantsCreditOverview, getMyCredit } from '../controllers/creditController';
import { getRentComps, getUnitPricing } from '../controllers/rentCompsController';
import { tenantLogin, tenantAuthConfig } from '../controllers/tenantAuthController';
import {
  tenantMe, tenantContracts, tenantRentRecords, tenantPaymentInfo,
  tenantMaintenanceList, tenantCreateMaintenance,
} from '../controllers/tenantPortalController';

const router = Router();

// Auth
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', requireAuth, me);
router.put('/auth/me', requireAuth, updateMe);

// 帳號權限管理（僅管理員）
router.get('/users', requireAuth, requireAdmin, listUsers);
router.get('/users/modules', requireAuth, requireAdmin, listModules);
router.post('/users', requireAuth, requireAdmin, createUser);
router.put('/users/:id', requireAuth, requireAdmin, updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, deleteUser);

// 資料管理（僅管理員）
router.get('/data/summary', requireAuth, requireAdmin, getDataSummary);
router.post('/data/wipe', requireAuth, requireAdmin, wipeAllData);

// Dashboard
router.get('/dashboard', requireAuth, getDashboard);

// Properties
router.get('/properties', requireAuth, getProperties);
router.post('/properties', requireAuth, createProperty);
router.put('/properties/:id', requireAuth, updateProperty);
router.delete('/properties/:id', requireAuth, deleteProperty);

// Units
router.get('/properties/:propertyId/units', requireAuth, getUnits);
router.post('/properties/:propertyId/units', requireAuth, createUnit);
router.put('/units/:id', requireAuth, updateUnit);
router.delete('/units/:id', requireAuth, deleteUnit);

// Tenants
router.get('/tenants', requireAuth, getTenants);
router.post('/tenants', requireAuth, createTenant);
router.put('/tenants/:id', requireAuth, updateTenant);
router.delete('/tenants/:id', requireAuth, deleteTenant);
router.post('/tenants/:id/line-code', requireAuth, generateTenantBindingCode);

// 車輛／車牌
router.get('/vehicles', requireAuth, getVehicles);
router.post('/tenants/:tenantId/vehicles', requireAuth, createVehicle);
router.put('/vehicles/:id', requireAuth, updateVehicle);
router.delete('/vehicles/:id', requireAuth, deleteVehicle);

// Contracts
router.get('/contracts', requireAuth, getContracts);
router.post('/contracts', requireAuth, createContract);
router.put('/contracts/:id', requireAuth, updateContract);
router.delete('/contracts/:id', requireAuth, deleteContract);
router.post('/contracts/:id/sign-invite', requireAuth, generateSignInvite);
router.post('/contracts/:id/compliance-check', requireAuth, checkCompliance);

// Handover（點交相冊）
router.get('/contracts/:contractId/handovers', requireAuth, getHandovers);
router.post('/contracts/:contractId/handovers', requireAuth, createHandover);
router.put('/handovers/:id', requireAuth, updateHandover);
router.post('/handovers/:id/send', requireAuth, sendHandoverForConfirmation);
// Public handover confirmation (no auth)
router.get('/handovers/confirm/:token', getHandoverByToken);
router.post('/handovers/confirm/:token', confirmHandoverByToken);
// Public signing endpoints (no auth)
router.get('/contracts/sign/:token', getContractByToken);
router.post('/contracts/sign/:token', signContractByToken);

// Deposit Refund
router.get('/contracts/:contractId/deposit-refund', requireAuth, getDepositRefund);
router.post('/contracts/:contractId/deposit-refund', requireAuth, upsertDepositRefund);
router.put('/contracts/:contractId/deposit-refund/confirm', requireAuth, confirmRefund);
router.post('/contracts/:contractId/deposit-refund/notify', requireAuth, notifyTenantRefund);

// Reminder Settings
router.get('/settings/reminder', requireAuth, getReminderSettings);
router.put('/settings/reminder', requireAuth, updateReminderSettings);
router.post('/settings/reminder/trigger', requireAuth, triggerReminders);

// Rent Records
router.get('/rent-records', requireAuth, getRentRecords);
router.post('/rent-records', requireAuth, createRentRecord);
router.put('/rent-records/:id', requireAuth, updateRentRecord);
router.delete('/rent-records/:id', requireAuth, deleteRentRecord);
router.put('/rent-records/:id/confirm', requireAuth, confirmPayment);
router.post('/rent-records/mark-overdue', requireAuth, markOverdue);
router.post('/rent-records/:id/remind', requireAuth, sendReminder);

// 收租鈴聲 / 月租與收入統計
router.get('/rent-alerts/today', requireAuth, getTodayRentAlerts);
router.get('/stats/rent-electricity', requireAuth, getRentUtilityStats);
router.get('/dorm-records', requireAuth, getDormRecords);

// Maintenance
router.get('/maintenance', requireAuth, getMaintenanceRequests);
router.post('/maintenance', requireAuth, createMaintenanceRequest);
router.put('/maintenance/:id', requireAuth, updateMaintenanceRequest);
router.delete('/maintenance/:id', requireAuth, deleteMaintenanceRequest);
router.post('/maintenance/:id/analyze', requireAuth, analyzeMaintenanceRequest);

// Expenses
router.get('/expenses', requireAuth, getExpenses);
router.post('/expenses', requireAuth, createExpense);
router.put('/expenses/:id/confirm', requireAuth, confirmExpense);
router.delete('/expenses/:id', requireAuth, deleteExpense);
router.put('/expenses/:id', requireAuth, updateExpense);
router.get('/expenses/trend', requireAuth, getExpenseTrend);

// Calendar
router.get('/calendar', requireAuth, getCalendarEvents);

// Finance
router.get('/collection-workbench', requireAuth, getCollectionWorkbench);
router.get('/finance-overview', requireAuth, getFinanceOverview);
router.get('/roi', requireAuth, getROIAnalysis);
router.get('/tax-export', requireAuth, exportTaxReport);
router.get('/tax-export/precheck', requireAuth, taxPrecheck);

// Utility bills（水電費分攤）
router.get('/utility-bills', requireAuth, getUtilityBills);
router.post('/utility-bills/preview', requireAuth, previewUtilitySplit);
router.post('/utility-bills', requireAuth, createUtilityBill);
router.post('/utility-bills/:id/bill', requireAuth, billUtilityToTenants);
router.put('/utility-bills/:id', requireAuth, updateUtilityBill);
router.delete('/utility-bills/:id', requireAuth, deleteUtilityBill);

// Rent comps（在地租金行情）
router.get('/rent-comps', requireAuth, getRentComps);
router.get('/units/:unitId/pricing', requireAuth, getUnitPricing);

// Tenant credit（車主信用分）
router.get('/tenant-credit', requireAuth, getTenantsCreditOverview);
router.get('/tenants/:id/credit', requireAuth, getTenantCredit);

// AI（業者助理 / 財務洞察 / 合約條款草擬）
router.post('/ai/assistant', requireAuth, assistantChat);
router.get('/ai/insights', requireAuth, getFinancialInsights);
router.post('/ai/draft-clauses', requireAuth, draftClauses);

// Listings (vacant units)
router.get('/listings/vacant', requireAuth, getVacantUnits);
router.post('/listings/units/:unitId', requireAuth, addListing);
router.put('/listings/:id', requireAuth, updateListing);
router.delete('/listings/:id', requireAuth, deleteListing);

// Payments / 金流自動對帳
router.get('/payments', requireAuth, getPayments);
router.get('/payments/unmatched', requireAuth, getUnmatchedPayments);
router.get('/payments/:id/suggestions', requireAuth, getMatchSuggestions);
router.post('/payments/:id/match', requireAuth, matchPayment);
router.delete('/payments/:id', requireAuth, deletePayment);
router.post('/payments/simulate', requireAuth, simulatePayment);
router.get('/contracts/:contractId/virtual-account', requireAuth, getContractVirtualAccount);
// Webhook（對外，無 JWT）
router.post('/payments/webhook/:provider', paymentWebhook);

// 租約書內容編輯與傳送
router.get('/contracts/:id/document', requireAuth, getContractDocument);
router.put('/contracts/:id/document', requireAuth, updateContractDocument);
router.post('/contracts/:id/document/reset', requireAuth, resetContractDocument);
router.post('/contracts/:id/document/preview', requireAuth, previewDocument);
router.post('/contracts/:id/document/send', requireAuth, sendContractDocument);
router.get('/contract-templates', requireAuth, getTemplates);
router.post('/contract-templates', requireAuth, createTemplate);
router.delete('/contract-templates/:templateId', requireAuth, deleteTemplate);
router.put('/contract-templates/:templateId', requireAuth, updateContractTemplate);
router.get('/contracts/sign/:token/document', getDocumentByToken);

// 預付電表（儲值制電費）
router.get('/prepaid', requireAuth, getPrepaidOverview);
router.get('/prepaid/candidates', requireAuth, getPrepaidCandidates);
router.post('/prepaid/check', requireAuth, triggerPrepaidCheck);
router.put('/prepaid/:unitId/config', requireAuth, updatePrepaidConfig);
router.get('/prepaid/:unitId/records', requireAuth, getPrepaidRecords);
router.post('/prepaid/:unitId/topup', requireAuth, postTopUp);
router.post('/prepaid/:unitId/usage', requireAuth, postUsage);
router.post('/prepaid/:unitId/adjust', requireAuth, postAdjust);
router.put('/prepaid-records/:id', requireAuth, updatePrepaidRecord);
router.delete('/prepaid-records/:id', requireAuth, deletePrepaidRecord);

// 通知排程規則（每種通知各自的執行時間與參數）
router.get('/notification-rules', requireAuth, getNotificationRules);
router.put('/notification-rules/:kind', requireAuth, updateNotificationRule);
router.post('/notification-rules/:kind/trigger', requireAuth, triggerNotificationRule);

// LINE
router.post('/line/webhook', webhook);
router.get('/line/binding', requireAuth, getLandlordBinding);
router.post('/line/binding/generate', requireAuth, generateLandlordBindingCode);
router.delete('/line/binding', requireAuth, unbindLandlord);
router.get('/line/tenants', requireAuth, getTenantBindings);

// ── 車主端 Portal（獨立 JWT，kind=tenant）──────────────────────────
router.get('/tenant/auth/config', tenantAuthConfig);
router.post('/tenant/auth/login', tenantLogin);
router.get('/tenant/me', requireTenant, tenantMe);
router.get('/tenant/contracts', requireTenant, tenantContracts);
router.get('/tenant/rent-records', requireTenant, tenantRentRecords);
router.get('/tenant/payment-info', requireTenant, tenantPaymentInfo);
router.get('/tenant/maintenance', requireTenant, tenantMaintenanceList);
router.post('/tenant/maintenance', requireTenant, tenantCreateMaintenance);
router.get('/tenant/handovers', requireTenant, tenantHandovers);
router.post('/tenant/handovers/:id/confirm', requireTenant, tenantConfirmHandover);
router.get('/tenant/credit', requireTenant, getMyCredit);

export default router;
