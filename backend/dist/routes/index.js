"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const userController_1 = require("../controllers/userController");
const tenantAuth_1 = require("../middleware/tenantAuth");
const prepaidController_1 = require("../controllers/prepaidController");
const notificationRuleController_1 = require("../controllers/notificationRuleController");
const contractDocumentController_1 = require("../controllers/contractDocumentController");
const rentAlertController_1 = require("../controllers/rentAlertController");
const crudController_1 = require("../controllers/crudController");
const vehicleController_1 = require("../controllers/vehicleController");
const authController_1 = require("../controllers/authController");
const dashboardController_1 = require("../controllers/dashboardController");
const propertyController_1 = require("../controllers/propertyController");
const unitController_1 = require("../controllers/unitController");
const tenantController_1 = require("../controllers/tenantController");
const contractController_1 = require("../controllers/contractController");
const depositRefundController_1 = require("../controllers/depositRefundController");
const listingController_1 = require("../controllers/listingController");
const reminderController_1 = require("../controllers/reminderController");
const rentController_1 = require("../controllers/rentController");
const maintenanceController_1 = require("../controllers/maintenanceController");
const expenseController_1 = require("../controllers/expenseController");
const lineController_1 = require("../controllers/lineController");
const calendarController_1 = require("../controllers/calendarController");
const collectionWorkbenchController_1 = require("../controllers/collectionWorkbenchController");
const roiController_1 = require("../controllers/roiController");
const taxExportController_1 = require("../controllers/taxExportController");
const paymentController_1 = require("../controllers/paymentController");
const contractController_2 = require("../controllers/contractController");
const maintenanceController_2 = require("../controllers/maintenanceController");
const taxExportController_2 = require("../controllers/taxExportController");
const aiController_1 = require("../controllers/aiController");
const handoverController_1 = require("../controllers/handoverController");
const utilityBillController_1 = require("../controllers/utilityBillController");
const creditController_1 = require("../controllers/creditController");
const rentCompsController_1 = require("../controllers/rentCompsController");
const tenantAuthController_1 = require("../controllers/tenantAuthController");
const tenantPortalController_1 = require("../controllers/tenantPortalController");
const attachmentController_1 = require("../controllers/attachmentController");
const router = (0, express_1.Router)();
// 任何刪除成功（含清空資料）後，清掉掛在已不存在資料上的附件檔
router.use((req, res, next) => {
    if (req.method === 'DELETE' || req.path === '/data/wipe') {
        res.on('finish', () => {
            if (res.statusCode < 300 && req.userId && !req.path.startsWith('/attachments')) {
                (0, attachmentController_1.purgeOrphanAttachments)(req.userId).catch((e) => console.error('[attachments purge]', e));
            }
        });
    }
    next();
});
// 附件（照片／檔案）。權限依附件所屬對象在 controller 內檢查。
router.get('/attachments', auth_1.requireAuth, attachmentController_1.listAttachments);
router.get('/attachments/summary', auth_1.requireAuth, attachmentController_1.attachmentSummary);
router.get('/attachments/categories', auth_1.requireAuth, attachmentController_1.getCategories);
router.post('/attachments', auth_1.requireAuth, attachmentController_1.uploadAttachment);
router.get('/attachments/:id/file', auth_1.requireAuth, attachmentController_1.downloadAttachment);
router.put('/attachments/:id', auth_1.requireAuth, attachmentController_1.updateAttachment);
router.delete('/attachments/:id', auth_1.requireAuth, attachmentController_1.deleteAttachment);
// Auth
router.post('/auth/register', authController_1.register);
router.post('/auth/login', authController_1.login);
router.get('/auth/demo', authController_1.demoAccount);
router.get('/auth/me', auth_1.requireAuth, authController_1.me);
router.put('/auth/me', auth_1.requireAuth, authController_1.updateMe);
// 帳號權限管理（僅管理員）
router.get('/users', auth_1.requireAuth, auth_1.requireAdmin, userController_1.listUsers);
router.get('/users/modules', auth_1.requireAuth, auth_1.requireAdmin, userController_1.listModules);
router.post('/users', auth_1.requireAuth, auth_1.requireAdmin, userController_1.createUser);
router.put('/users/:id', auth_1.requireAuth, auth_1.requireAdmin, userController_1.updateUser);
router.delete('/users/:id', auth_1.requireAuth, auth_1.requireAdmin, userController_1.deleteUser);
// 資料管理（僅管理員）
router.get('/data/summary', auth_1.requireAuth, auth_1.requireAdmin, crudController_1.getDataSummary);
router.post('/data/wipe', auth_1.requireAuth, auth_1.requireAdmin, crudController_1.wipeAllData);
// Dashboard
router.get('/dashboard', auth_1.requireAuth, dashboardController_1.getDashboard);
// Properties
router.get('/properties', auth_1.requireAuth, propertyController_1.getProperties);
router.post('/properties', auth_1.requireAuth, propertyController_1.createProperty);
router.put('/properties/:id', auth_1.requireAuth, propertyController_1.updateProperty);
router.delete('/properties/:id', auth_1.requireAuth, propertyController_1.deleteProperty);
// Units
router.get('/properties/:propertyId/units', auth_1.requireAuth, unitController_1.getUnits);
router.post('/properties/:propertyId/units', auth_1.requireAuth, unitController_1.createUnit);
router.put('/units/:id', auth_1.requireAuth, unitController_1.updateUnit);
router.delete('/units/:id', auth_1.requireAuth, unitController_1.deleteUnit);
// Tenants
router.get('/tenants', auth_1.requireAuth, tenantController_1.getTenants);
router.post('/tenants', auth_1.requireAuth, tenantController_1.createTenant);
router.put('/tenants/:id', auth_1.requireAuth, tenantController_1.updateTenant);
router.delete('/tenants/:id', auth_1.requireAuth, tenantController_1.deleteTenant);
router.post('/tenants/:id/line-code', auth_1.requireAuth, tenantController_1.generateTenantBindingCode);
// 車輛／車牌
router.get('/vehicles', auth_1.requireAuth, vehicleController_1.getVehicles);
router.post('/tenants/:tenantId/vehicles', auth_1.requireAuth, vehicleController_1.createVehicle);
router.put('/vehicles/:id', auth_1.requireAuth, vehicleController_1.updateVehicle);
router.delete('/vehicles/:id', auth_1.requireAuth, vehicleController_1.deleteVehicle);
// Contracts
router.get('/contracts', auth_1.requireAuth, contractController_1.getContracts);
router.post('/contracts', auth_1.requireAuth, contractController_1.createContract);
router.put('/contracts/:id', auth_1.requireAuth, contractController_1.updateContract);
router.delete('/contracts/:id', auth_1.requireAuth, crudController_1.deleteContract);
router.post('/contracts/:id/sign-invite', auth_1.requireAuth, contractController_1.generateSignInvite);
router.post('/contracts/:id/compliance-check', auth_1.requireAuth, contractController_2.checkCompliance);
// Handover（點交相冊）
router.get('/contracts/:contractId/handovers', auth_1.requireAuth, handoverController_1.getHandovers);
router.post('/contracts/:contractId/handovers', auth_1.requireAuth, handoverController_1.createHandover);
router.put('/handovers/:id', auth_1.requireAuth, handoverController_1.updateHandover);
router.post('/handovers/:id/send', auth_1.requireAuth, handoverController_1.sendHandoverForConfirmation);
// Public handover confirmation (no auth)
router.get('/handovers/confirm/:token', handoverController_1.getHandoverByToken);
router.post('/handovers/confirm/:token', handoverController_1.confirmHandoverByToken);
// Public signing endpoints (no auth)
router.get('/contracts/sign/:token', contractController_1.getContractByToken);
router.post('/contracts/sign/:token', contractController_1.signContractByToken);
// Deposit Refund
router.get('/contracts/:contractId/deposit-refund', auth_1.requireAuth, depositRefundController_1.getDepositRefund);
router.post('/contracts/:contractId/deposit-refund', auth_1.requireAuth, depositRefundController_1.upsertDepositRefund);
router.put('/contracts/:contractId/deposit-refund/confirm', auth_1.requireAuth, depositRefundController_1.confirmRefund);
router.post('/contracts/:contractId/deposit-refund/notify', auth_1.requireAuth, depositRefundController_1.notifyTenantRefund);
// Reminder Settings
router.get('/settings/reminder', auth_1.requireAuth, reminderController_1.getReminderSettings);
router.put('/settings/reminder', auth_1.requireAuth, reminderController_1.updateReminderSettings);
router.post('/settings/reminder/trigger', auth_1.requireAuth, reminderController_1.triggerReminders);
// Rent Records
router.get('/rent-records', auth_1.requireAuth, rentController_1.getRentRecords);
router.post('/rent-records', auth_1.requireAuth, crudController_1.createRentRecord);
router.put('/rent-records/:id', auth_1.requireAuth, crudController_1.updateRentRecord);
router.delete('/rent-records/:id', auth_1.requireAuth, crudController_1.deleteRentRecord);
router.put('/rent-records/:id/confirm', auth_1.requireAuth, rentController_1.confirmPayment);
router.post('/rent-records/mark-overdue', auth_1.requireAuth, rentController_1.markOverdue);
router.post('/rent-records/:id/remind', auth_1.requireAuth, rentController_1.sendReminder);
// 收租鈴聲 / 月租與收入統計
router.get('/rent-alerts/today', auth_1.requireAuth, rentAlertController_1.getTodayRentAlerts);
router.get('/stats/rent-electricity', auth_1.requireAuth, rentAlertController_1.getRentUtilityStats);
router.get('/dorm-records', auth_1.requireAuth, rentAlertController_1.getDormRecords);
// Maintenance
router.get('/maintenance', auth_1.requireAuth, maintenanceController_1.getMaintenanceRequests);
router.post('/maintenance', auth_1.requireAuth, maintenanceController_1.createMaintenanceRequest);
router.put('/maintenance/:id', auth_1.requireAuth, maintenanceController_1.updateMaintenanceRequest);
router.delete('/maintenance/:id', auth_1.requireAuth, crudController_1.deleteMaintenanceRequest);
router.post('/maintenance/:id/analyze', auth_1.requireAuth, maintenanceController_2.analyzeMaintenanceRequest);
// Expenses
router.get('/expenses', auth_1.requireAuth, expenseController_1.getExpenses);
router.post('/expenses', auth_1.requireAuth, expenseController_1.createExpense);
router.put('/expenses/:id/confirm', auth_1.requireAuth, expenseController_1.confirmExpense);
router.delete('/expenses/:id', auth_1.requireAuth, expenseController_1.deleteExpense);
router.put('/expenses/:id', auth_1.requireAuth, crudController_1.updateExpense);
router.get('/expenses/trend', auth_1.requireAuth, expenseController_1.getExpenseTrend);
// Calendar
router.get('/calendar', auth_1.requireAuth, calendarController_1.getCalendarEvents);
// Finance
router.get('/collection-workbench', auth_1.requireAuth, collectionWorkbenchController_1.getCollectionWorkbench);
router.get('/finance-overview', auth_1.requireAuth, collectionWorkbenchController_1.getFinanceOverview);
router.get('/roi', auth_1.requireAuth, roiController_1.getROIAnalysis);
router.get('/tax-export', auth_1.requireAuth, taxExportController_1.exportTaxReport);
router.get('/tax-export/precheck', auth_1.requireAuth, taxExportController_2.taxPrecheck);
// Utility bills（水電費分攤）
router.get('/utility-bills', auth_1.requireAuth, utilityBillController_1.getUtilityBills);
router.post('/utility-bills/preview', auth_1.requireAuth, utilityBillController_1.previewUtilitySplit);
router.post('/utility-bills', auth_1.requireAuth, utilityBillController_1.createUtilityBill);
router.post('/utility-bills/:id/bill', auth_1.requireAuth, utilityBillController_1.billUtilityToTenants);
router.put('/utility-bills/:id', auth_1.requireAuth, crudController_1.updateUtilityBill);
router.delete('/utility-bills/:id', auth_1.requireAuth, crudController_1.deleteUtilityBill);
// Rent comps（在地租金行情）
router.get('/rent-comps', auth_1.requireAuth, rentCompsController_1.getRentComps);
router.get('/units/:unitId/pricing', auth_1.requireAuth, rentCompsController_1.getUnitPricing);
// Tenant credit（車主信用分）
router.get('/tenant-credit', auth_1.requireAuth, creditController_1.getTenantsCreditOverview);
router.get('/tenants/:id/credit', auth_1.requireAuth, creditController_1.getTenantCredit);
// AI（業者助理 / 財務洞察 / 合約條款草擬）
router.post('/ai/assistant', auth_1.requireAuth, aiController_1.assistantChat);
router.get('/ai/insights', auth_1.requireAuth, aiController_1.getFinancialInsights);
router.post('/ai/draft-clauses', auth_1.requireAuth, aiController_1.draftClauses);
// Listings (vacant units)
router.get('/listings/vacant', auth_1.requireAuth, listingController_1.getVacantUnits);
router.post('/listings/units/:unitId', auth_1.requireAuth, listingController_1.addListing);
router.put('/listings/:id', auth_1.requireAuth, listingController_1.updateListing);
router.delete('/listings/:id', auth_1.requireAuth, listingController_1.deleteListing);
// Payments / 金流自動對帳
router.get('/payments', auth_1.requireAuth, paymentController_1.getPayments);
router.get('/payments/unmatched', auth_1.requireAuth, paymentController_1.getUnmatchedPayments);
router.get('/payments/:id/suggestions', auth_1.requireAuth, paymentController_1.getMatchSuggestions);
router.post('/payments/:id/match', auth_1.requireAuth, paymentController_1.matchPayment);
router.delete('/payments/:id', auth_1.requireAuth, crudController_1.deletePayment);
router.post('/payments/simulate', auth_1.requireAuth, paymentController_1.simulatePayment);
router.get('/contracts/:contractId/virtual-account', auth_1.requireAuth, paymentController_1.getContractVirtualAccount);
// Webhook（對外，無 JWT）
router.post('/payments/webhook/:provider', paymentController_1.paymentWebhook);
// 租約書內容編輯與傳送
router.get('/contracts/:id/document', auth_1.requireAuth, contractDocumentController_1.getContractDocument);
router.put('/contracts/:id/document', auth_1.requireAuth, contractDocumentController_1.updateContractDocument);
router.post('/contracts/:id/document/reset', auth_1.requireAuth, contractDocumentController_1.resetContractDocument);
router.post('/contracts/:id/document/preview', auth_1.requireAuth, contractDocumentController_1.previewDocument);
router.post('/contracts/:id/document/send', auth_1.requireAuth, contractDocumentController_1.sendContractDocument);
router.get('/contract-templates', auth_1.requireAuth, contractDocumentController_1.getTemplates);
router.post('/contract-templates', auth_1.requireAuth, contractDocumentController_1.createTemplate);
router.delete('/contract-templates/:templateId', auth_1.requireAuth, contractDocumentController_1.deleteTemplate);
router.put('/contract-templates/:templateId', auth_1.requireAuth, crudController_1.updateContractTemplate);
router.get('/contracts/sign/:token/document', contractDocumentController_1.getDocumentByToken);
// 預付電表（儲值制電費）
router.get('/prepaid', auth_1.requireAuth, prepaidController_1.getPrepaidOverview);
router.get('/prepaid/candidates', auth_1.requireAuth, prepaidController_1.getPrepaidCandidates);
router.post('/prepaid/check', auth_1.requireAuth, prepaidController_1.triggerPrepaidCheck);
router.put('/prepaid/:unitId/config', auth_1.requireAuth, prepaidController_1.updatePrepaidConfig);
router.get('/prepaid/:unitId/records', auth_1.requireAuth, prepaidController_1.getPrepaidRecords);
router.post('/prepaid/:unitId/topup', auth_1.requireAuth, prepaidController_1.postTopUp);
router.post('/prepaid/:unitId/usage', auth_1.requireAuth, prepaidController_1.postUsage);
router.post('/prepaid/:unitId/adjust', auth_1.requireAuth, prepaidController_1.postAdjust);
router.put('/prepaid-records/:id', auth_1.requireAuth, crudController_1.updatePrepaidRecord);
router.delete('/prepaid-records/:id', auth_1.requireAuth, crudController_1.deletePrepaidRecord);
// 通知排程規則（每種通知各自的執行時間與參數）
router.get('/notification-rules', auth_1.requireAuth, notificationRuleController_1.getNotificationRules);
router.put('/notification-rules/:kind', auth_1.requireAuth, notificationRuleController_1.updateNotificationRule);
router.post('/notification-rules/:kind/trigger', auth_1.requireAuth, notificationRuleController_1.triggerNotificationRule);
// LINE
router.post('/line/webhook', lineController_1.webhook);
router.get('/line/binding', auth_1.requireAuth, lineController_1.getLandlordBinding);
router.post('/line/binding/generate', auth_1.requireAuth, lineController_1.generateLandlordBindingCode);
router.delete('/line/binding', auth_1.requireAuth, lineController_1.unbindLandlord);
router.get('/line/tenants', auth_1.requireAuth, lineController_1.getTenantBindings);
// ── 車主端 Portal（獨立 JWT，kind=tenant）──────────────────────────
router.get('/tenant/auth/config', tenantAuthController_1.tenantAuthConfig);
router.post('/tenant/auth/login', tenantAuthController_1.tenantLogin);
router.get('/tenant/me', tenantAuth_1.requireTenant, tenantPortalController_1.tenantMe);
router.get('/tenant/contracts', tenantAuth_1.requireTenant, tenantPortalController_1.tenantContracts);
router.get('/tenant/rent-records', tenantAuth_1.requireTenant, tenantPortalController_1.tenantRentRecords);
router.get('/tenant/payment-info', tenantAuth_1.requireTenant, tenantPortalController_1.tenantPaymentInfo);
router.get('/tenant/maintenance', tenantAuth_1.requireTenant, tenantPortalController_1.tenantMaintenanceList);
router.post('/tenant/maintenance', tenantAuth_1.requireTenant, tenantPortalController_1.tenantCreateMaintenance);
router.get('/tenant/handovers', tenantAuth_1.requireTenant, handoverController_1.tenantHandovers);
router.post('/tenant/handovers/:id/confirm', tenantAuth_1.requireTenant, handoverController_1.tenantConfirmHandover);
router.get('/tenant/credit', tenantAuth_1.requireTenant, creditController_1.getMyCredit);
exports.default = router;
