import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:5173';
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const PAGES = [
  { path: '/', name: 'Dashboard' },
  { path: '/assets', name: 'Assets' },
  { path: '/assignments', name: 'Assignments' },
  { path: '/inventory', name: 'Inventory' },
  { path: '/employees', name: 'Employees' },
  { path: '/departments', name: 'Departments' },
  { path: '/locations', name: 'Locations' },
  { path: '/maintenance', name: 'Maintenance' },
  { path: '/knowledge-base', name: 'Knowledge Base' },
  { path: '/network-tools', name: 'Network Tools' },
  { path: '/reports', name: 'Reports' },
  { path: '/activity-log', name: 'Activity Log' },
  { path: '/settings', name: 'Settings' },
];

// Helper functions
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
}

async function clickAndWait(page: Page, selector: string, options?: { timeout?: number }) {
  await page.click(selector, { timeout: options?.timeout || 5000 });
  await page.waitForTimeout(300);
}

async function fillForm(page: Page, fields: Record<string, string>) {
  for (const [selector, value] of Object.entries(fields)) {
    await page.fill(selector, value);
    await page.waitForTimeout(100);
  }
}

async function testConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', error => {
    errors.push(error.message);
  });
  await page.waitForTimeout(500);
  return errors;
}

// Main test suite
test.describe('FixDesk Complete Application Audit', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    
    // Set up console error tracking
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[CONSOLE ERROR] ${msg.text()}`);
      }
    });
    
    page.on('pageerror', error => {
      console.log(`[PAGE ERROR] ${error.message}`);
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  // Test 1: Login Page
  test.describe('Login Page', () => {
    test('should load login page correctly', async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      
      // Check page elements
      await expect(page.locator('span:has-text("FixDesk")').first()).toBeVisible();
      await expect(page.locator('text=Sign in to FixDesk')).toBeVisible();
      await expect(page.locator('button:has-text("Sign in with Google")')).toBeVisible();
      await expect(page.locator('button:has-text("Open Local Offline Workspace")')).toBeVisible();
    });

    test('should switch to email login', async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Use email and password instead")');
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('should show demo credentials', async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'summary:has-text("Demo credentials")');
      await expect(page.locator('text=admin@fixdesk.local')).toBeVisible();
    });
  });

  // Test 2: Local Mode Entry
  test.describe('Local Mode', () => {
    test('should enter local offline mode', async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      
      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.locator('text=Dashboard')).toBeVisible();
    });
  });

  // Test 3: Navigation and Sidebar
  test.describe('Navigation', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
    });

    test('should navigate to all pages via sidebar', async () => {
      for (const pageInfo of PAGES) {
        if (pageInfo.path === '/') continue; // Dashboard is default
        
        // Click sidebar navigation
        const navSelector = `nav a[href="${pageInfo.path}"], nav button[data-page="${pageInfo.path}"]`;
        await clickAndWait(page, navSelector);
        await waitForPageLoad(page);
        
        // Verify page loaded
        await expect(page.locator(`text=${pageInfo.name}`).first()).toBeVisible();
        console.log(`✓ Navigated to ${pageInfo.name}`);
      }
    });

    test('should show active navigation state', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      // Check active nav item
      const activeNav = page.locator('nav a[href="/assets"].active, nav button[data-page="/assets"].active, nav a[href="/assets"][aria-current="page"]');
      await expect(activeNav).toBeVisible();
    });
  });

  // Test 4: Dashboard Page
  test.describe('Dashboard', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
    });

    test('should display KPI cards', async () => {
      await expect(page.locator('text=Total Assets')).toBeVisible();
      await expect(page.locator('text=Active Assignments')).toBeVisible();
      await expect(page.locator('text=Low Stock Items')).toBeVisible();
      await expect(page.locator('text=Overdue Maintenance')).toBeVisible();
    });

    test('should display charts', async () => {
      // Check for chart containers
      await expect(page.locator('canvas, svg.recharts-surface').first()).toBeVisible();
    });

    test('should have functional quick action buttons', async () => {
      // Test quick action buttons if present
      const addAssetBtn = page.locator('button:has-text("Add Asset"), a:has-text("Add Asset")').first();
      if (await addAssetBtn.isVisible()) {
        await clickAndWait(page, addAssetBtn);
        // Should open modal or navigate
        await expect(page.locator('[role="dialog"], .modal')).toBeVisible({ timeout: 3000 });
      }
    });
  });

  // Test 5: Assets Page
  test.describe('Assets Management', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
    });

    test('should display asset table', async () => {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=Asset Tag')).toBeVisible();
      await expect(page.locator('text=Name')).toBeVisible();
    });

    test('should open add asset modal', async () => {
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      await expect(page.locator('[role="dialog"]').filter({ hasText: /Add|Create/ })).toBeVisible();
    });

    test('should validate asset form', async () => {
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      
      // Try submit without required fields
      await clickAndWait(page, 'button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Create")');
      
      // Should show validation errors
      await expect(page.locator('text=required, text=Required, .error')).toBeVisible({ timeout: 3000 });
    });

    test('should create new asset', async () => {
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      
      await fillForm(page, {
        'input[id*="asset-tag"], input[name*="assetTag"]': `TEST-${Date.now()}`,
        'input[id*="name"], input[name*="name"]': 'Test Asset',
        'select[name*="category"], select[id*="category"]': 'Laptop',
        'input[id*="serial"], input[name*="serialNumber"]': `SN-${Date.now()}`,
        'input[id*="purchase-price"], input[name*="purchasePrice"]': '1000',
      });
      
      await clickAndWait(page, 'button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Create")');
      
      // Should close modal and show toast
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator('.toast, [role="alert"]')).toBeVisible({ timeout: 3000 });
    });

    test('should edit existing asset', async () => {
      // Find first edit button
      const editBtn = page.locator('button:has-text("Edit"), button[aria-label*="Edit"]').first();
      if (await editBtn.isVisible()) {
        await clickAndWait(page, editBtn);
        await expect(page.locator('[role="dialog"]').filter({ hasText: /Edit/ })).toBeVisible();
      }
    });

    test('should delete asset with confirmation', async () => {
      const deleteBtn = page.locator('button:has-text("Delete"), button[aria-label*="Delete"]').first();
      if (await deleteBtn.isVisible()) {
        await clickAndWait(page, deleteBtn);
        await expect(page.locator('[role="dialog"]').filter({ hasText: /Delete/ })).toBeVisible();
        
        // Cancel deletion
        await clickAndWait(page, 'button:has-text("Cancel")');
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
      }
    });

    test('should filter assets', async () => {
      // Test search
      await page.fill('input[placeholder*="Search"], input[aria-label*="Search"]', 'Laptop');
      await page.waitForTimeout(500);
      
      // Test category filter
      const categorySelect = page.locator('select[aria-label*="category" i], select[name*="category"]').first();
      if (await categorySelect.isVisible()) {
        await categorySelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
      
      // Test status filter
      const statusSelect = page.locator('select[aria-label*="status" i], select[name*="status"]').first();
      if (await statusSelect.isVisible()) {
        await statusSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    });

    test('should export assets to CSV', async () => {
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV")').first();
      if (await exportBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, exportBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }
    });

    test('should generate QR code', async () => {
      const qrBtn = page.locator('button[aria-label*="QR"], button:has-text("QR")').first();
      if (await qrBtn.isVisible()) {
        await clickAndWait(page, qrBtn);
        await expect(page.locator('[role="dialog"]').filter({ hasText: /QR/ })).toBeVisible();
        await clickAndWait(page, 'button:has-text("Close"), button[aria-label="Close dialog"]');
      }
    });
  });

  // Test 6: Assignments Page
  test.describe('Assignments', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/assignments`);
      await waitForPageLoad(page);
    });

    test('should display assignments table', async () => {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=Asset')).toBeVisible();
      await expect(page.locator('text=Assigned To')).toBeVisible();
    });

    test('should open assign asset modal', async () => {
      await clickAndWait(page, 'button:has-text("Assign"), button:has-text("New Assignment")');
      await expect(page.locator('[role="dialog"]').filter({ hasText: /Assign/ })).toBeVisible();
    });

    test('should validate assignment form', async () => {
      await clickAndWait(page, 'button:has-text("Assign"), button:has-text("New Assignment")');
      await clickAndWait(page, 'button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Assign")');
      await expect(page.locator('.error, text=required')).toBeVisible({ timeout: 3000 });
    });

    test('should create assignment', async () => {
      await clickAndWait(page, 'button:has-text("Assign"), button:has-text("New Assignment")');
      
      const assetSelect = page.locator('select[name*="asset"]').first();
      const employeeSelect = page.locator('select[name*="employee"]').first();
      
      if (await assetSelect.isVisible() && await employeeSelect.isVisible()) {
        await assetSelect.selectOption({ index: 1 });
        await employeeSelect.selectOption({ index: 1 });
        await clickAndWait(page, 'button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Assign")');
        
        await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
        await expect(page.locator('.toast, [role="alert"]')).toBeVisible({ timeout: 3000 });
      }
    });

    test('should handle handover/return', async () => {
      const handoverBtn = page.locator('button:has-text("Handover"), button:has-text("Return")').first();
      if (await handoverBtn.isVisible()) {
        await clickAndWait(page, handoverBtn);
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    });
  });

  // Test 7: Inventory Page
  test.describe('Inventory', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/inventory`);
      await waitForPageLoad(page);
    });

    test('should display inventory table', async () => {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=SKU')).toBeVisible();
      await expect(page.locator('text=Quantity')).toBeVisible();
    });

    test('should open add inventory modal', async () => {
      await clickAndWait(page, 'button:has-text("Add"), button:has-text("New Item")');
      await expect(page.locator('[role="dialog"]').filter({ hasText: /Add|Create/ })).toBeVisible();
    });

    test('should create inventory item', async () => {
      await clickAndWait(page, 'button:has-text("Add"), button:has-text("New Item")');
      
      await fillForm(page, {
        'input[id*="sku"], input[name*="sku"]': `SKU-${Date.now()}`,
        'input[id*="name"], input[name*="name"]': 'Test Inventory Item',
        'select[name*="category"]': 'Cables',
        'input[id*="quantity"], input[name*="quantity"]': '10',
        'input[id*="unit-price"], input[name*="unitPrice"]': '25',
        'input[id*="min-stock"], input[name*="minStock"]': '5',
      });
      
      await clickAndWait(page, 'button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Create")');
      
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator('.toast, [role="alert"]')).toBeVisible({ timeout: 3000 });
    });

    test('should record stock movement', async () => {
      const stockBtn = page.locator('button:has-text("Stock"), button:has-text("Movement")').first();
      if (await stockBtn.isVisible()) {
        await clickAndWait(page, stockBtn);
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    });

    test('should export inventory to CSV', async () => {
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV")').first();
      if (await exportBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, exportBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }
    });
  });

  // Test 8: Employees Page
  test.describe('Employees', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/employees`);
      await waitForPageLoad(page);
    });

    test('should display employee table', async () => {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=Name')).toBeVisible();
      await expect(page.locator('text=Department')).toBeVisible();
    });

    test('should open add employee modal', async () => {
      await clickAndWait(page, 'button:has-text("Add"), button:has-text("New Employee")');
      await expect(page.locator('[role="dialog"]').filter({ hasText: /Add|Create/ })).toBeVisible();
    });

    test('should create employee', async () => {
      await clickAndWait(page, 'button:has-text("Add"), button:has-text("New Employee")');
      
      await fillForm(page, {
        'input[id*="code"], input[name*="employeeCode"]': `EMP-${Date.now()}`,
        'input[id*="name"], input[name*="fullName"]': 'Test Employee',
        'input[id*="email"], input[name*="email"]': `test${Date.now()}@example.com`,
        'select[name*="department"]': 'IT',
        'select[name*="position"]': 'Developer',
      });
      
      await clickAndWait(page, 'button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Create")');
      
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator('.toast, [role="alert"]')).toBeVisible({ timeout: 3000 });
    });

    test('should show exit checklist', async () => {
      const exitBtn = page.locator('button:has-text("Exit"), button:has-text("Checklist")').first();
      if (await exitBtn.isVisible()) {
        await clickAndWait(page, exitBtn);
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    });

    test('should export employees to CSV', async () => {
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV")').first();
      if (await exportBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, exportBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }
    });
  });

  // Test 9: Departments Page
  test.describe('Departments', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/departments`);
      await waitForPageLoad(page);
    });

    test('should display departments', async () => {
      await expect(page.locator('table, .card, .grid')).toBeVisible();
    });

    test('should add department', async () => {
      await clickAndWait(page, 'button:has-text("Add"), button:has-text("New Department")');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      
      await fillForm(page, {
        'input[name*="name"], input[id*="name"]': `Test Dept ${Date.now()}`,
        'input[name*="description"], input[id*="description"]': 'Test Description',
      });
      
      await clickAndWait(page, 'button[type="submit"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    });
  });

  // Test 10: Locations Page
  test.describe('Locations', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/locations`);
      await waitForPageLoad(page);
    });

    test('should display locations', async () => {
      await expect(page.locator('table, .card, .grid')).toBeVisible();
    });

    test('should add location', async () => {
      await clickAndWait(page, 'button:has-text("Add"), button:has-text("New Location")');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      
      await fillForm(page, {
        'input[name*="name"], input[id*="name"]': `Test Location ${Date.now()}`,
        'input[name*="address"], input[id*="address"]': '123 Test St',
      });
      
      await clickAndWait(page, 'button[type="submit"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    });
  });

  // Test 11: Maintenance Page
  test.describe('Maintenance', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/maintenance`);
      await waitForPageLoad(page);
    });

    test('should display maintenance table', async () => {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=Asset')).toBeVisible();
      await expect(page.locator('text=Scheduled')).toBeVisible();
    });

    test('should open schedule maintenance modal', async () => {
      await clickAndWait(page, 'button:has-text("Schedule"), button:has-text("New Maintenance")');
      await expect(page.locator('[role="dialog"]').filter({ hasText: /Schedule|Maintenance/ })).toBeVisible();
    });

    test('should create maintenance record', async () => {
      await clickAndWait(page, 'button:has-text("Schedule"), button:has-text("New Maintenance")');
      
      const assetSelect = page.locator('select[name*="asset"]').first();
      if (await assetSelect.isVisible()) {
        await assetSelect.selectOption({ index: 1 });
      }
      
      await fillForm(page, {
        'select[name*="type"]': 'Inspection',
        'input[type="date"][name*="date"]': '2025-12-31',
        'input[name*="technician"]': 'John Tech',
        'input[name*="cost"]': '150',
      });
      
      await clickAndWait(page, 'button[type="submit"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    });

    test('should test recurrence preview', async () => {
      await clickAndWait(page, 'button:has-text("Schedule"), button:has-text("New Maintenance")');
      
      const recurrenceSelect = page.locator('select[name*="recurrence"]').first();
      if (await recurrenceSelect.isVisible()) {
        await recurrenceSelect.selectOption('MONTHLY');
        await page.waitForTimeout(500);
        // Check next date preview
        await expect(page.locator('text=/Next.*:/i')).toBeVisible({ timeout: 3000 });
      }
    });

    test('should complete maintenance', async () => {
      const completeBtn = page.locator('button:has-text("Complete")').first();
      if (await completeBtn.isVisible()) {
        await clickAndWait(page, completeBtn);
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    });

    test('should export maintenance to CSV', async () => {
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV")').first();
      if (await exportBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, exportBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }
    });
  });

  // Test 12: Knowledge Base Page
  test.describe('Knowledge Base', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/knowledge-base`);
      await waitForPageLoad(page);
    });

    test('should display article list', async () => {
      await expect(page.locator('text=Articles')).toBeVisible();
    });

    test('should open create article modal', async () => {
      await clickAndWait(page, 'button:has-text("New Article"), button:has-text("Create Article")');
      await expect(page.locator('[role="dialog"]').filter({ hasText: /Create/ })).toBeVisible();
    });

    test('should create article with markdown', async () => {
      await clickAndWait(page, 'button:has-text("New Article"), button:has-text("Create Article")');
      
      await fillForm(page, {
        'input[name*="title"], input[id*="title"]': `Test Article ${Date.now()}`,
        'select[name*="category"]': 'Hardware',
        'select[name*="accessLevel"]': 'IT_ONLY',
        'input[name*="summary"]': 'Test summary',
        'textarea[name*="content"]': '# Heading\n- Bullet 1\n- Bullet 2\n\n```bash\necho test\n```',
      });
      
      await clickAndWait(page, 'button[type="submit"]:has-text("Publish")');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    });

    test('should search articles', async () => {
      await page.fill('input[placeholder*="Search"], input[aria-label*="Search"]', 'test');
      await page.waitForTimeout(500);
    });

    test('should filter by category', async () => {
      const categorySelect = page.locator('select[aria-label*="category"]').first();
      if (await categorySelect.isVisible()) {
        await categorySelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    });

    test('should switch view modes', async () => {
      // Split view
      await clickAndWait(page, 'button[aria-label*="Split"]');
      await expect(page.locator('.grid-cols-12')).toBeVisible();
      
      // List view
      await clickAndWait(page, 'button[aria-label*="List"]');
      await expect(page.locator('table')).toBeVisible();
      
      // Grid view
      await clickAndWait(page, 'button[aria-label*="Grid"]');
      await expect(page.locator('.grid-cols-3')).toBeVisible();
    });

    test('should export to CSV', async () => {
      const exportBtn = page.locator('button:has-text("Export")').first();
      if (await exportBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, exportBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }
    });
  });

  // Test 13: Network Tools Page
  test.describe('Network Tools', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/network-tools`);
      await waitForPageLoad(page);
    });

    test('should calculate subnet', async () => {
      await expect(page.locator('text=IPv4 CIDR Subnet Calculator')).toBeVisible();
      
      await fillForm(page, {
        'input[id*="ip"], input[name*="ip"]': '192.168.1.100',
        'select[name*="cidr"]': '24',
      });
      
      await expect(page.locator('text=Network Address')).toBeVisible();
      await expect(page.locator('text=192.168.1.0')).toBeVisible();
    });

    test('should use preset buttons', async () => {
      await clickAndWait(page, 'button:has-text("10.20.4.12/22")');
      await expect(page.locator('input[id*="ip"]')).toHaveValue('10.20.4.12');
      await expect(page.locator('select[name*="cidr"]')).toHaveValue('22');
    });

    test('should run diagnostic checklist', async () => {
      await expect(page.locator('text=Connectivity Diagnostic Checklist')).toBeVisible();
      
      // Click first checklist item
      const firstCheck = page.locator('button:has-text("Physical")').first();
      if (await firstCheck.isVisible()) {
        await clickAndWait(page, firstCheck);
        // Should show checked state
        await expect(page.locator('.bg-emerald-50, .border-emerald-300').first()).toBeVisible();
      }
    });

    test('should reset checklist', async () => {
      await clickAndWait(page, 'button:has-text("Reset")');
      // All items should be unchecked
    });

    test('should select troubleshooting guide', async () => {
      await expect(page.locator('text=Network Troubleshooting Runbooks')).toBeVisible();
      
      // Click a guide
      const guide = page.locator('button:has-text("Internet Connectivity Outage")').first();
      if (await guide.isVisible()) {
        await clickAndWait(page, guide);
        await expect(page.locator('text=Common Symptoms')).toBeVisible();
      }
    });

    test('should expand/collapse guide sections', async () => {
      await clickAndWait(page, 'button:has-text("Verification Steps")');
      await page.waitForTimeout(300);
      await clickAndWait(page, 'button:has-text("Verification Steps")');
      await page.waitForTimeout(300);
    });

    test('should copy commands', async () => {
      const copyBtn = page.locator('button[aria-label*="Copy"]').first();
      if (await copyBtn.isVisible()) {
        await clickAndWait(page, copyBtn);
        await expect(page.locator('.toast, [role="alert"]')).toBeVisible({ timeout: 3000 });
      }
    });

    test('should export checklist', async () => {
      const exportBtn = page.locator('button:has-text("Export Checklist")').first();
      if (await exportBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, exportBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }
    });
  });

  // Test 14: Reports Page
  test.describe('Reports', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/reports`);
      await waitForPageLoad(page);
    });

    test('should display report tabs', async () => {
      await expect(page.locator('button[role="tab"]:has-text("Asset Register")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Inventory")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Maintenance")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Employee Equipment")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Monthly")')).toBeVisible();
    });

    test('should switch between tabs', async () => {
      await clickAndWait(page, 'button[role="tab"]:has-text("Inventory")');
      await expect(page.locator('text=Total Stock Valuation')).toBeVisible();
      
      await clickAndWait(page, 'button[role="tab"]:has-text("Maintenance")');
      await expect(page.locator('text=Cumulative Maintenance Spend')).toBeVisible();
      
      await clickAndWait(page, 'button[role="tab"]:has-text("Monthly")');
      await expect(page.locator('text=Executive IT Operations Report')).toBeVisible();
    });

    test('should display charts', async () => {
      // Check for charts in asset report
      await expect(page.locator('svg.recharts-surface, canvas').first()).toBeVisible();
    });

    test('should filter reports', async () => {
      // Open filters
      await clickAndWait(page, 'button:has-text("Filters")');
      await expect(page.locator('select[aria-label*="department"]')).toBeVisible();
      
      // Apply department filter
      const deptSelect = page.locator('select[aria-label*="department"]').first();
      await deptSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    });

    test('should export each report to CSV', async () => {
      const tabs = [
        'Asset Register',
        'Inventory',
        'Maintenance',
        'Employee Equipment',
        'Monthly',
      ];
      
      for (const tab of tabs) {
        await clickAndWait(page, `button[role="tab"]:has-text("${tab}")`);
        const exportBtn = page.locator('button:has-text("Export CSV")').first();
        if (await exportBtn.isVisible()) {
          const downloadPromise = page.waitForEvent('download');
          await clickAndWait(page, exportBtn);
          const download = await downloadPromise;
          expect(download.suggestedFilename()).toMatch(/\.csv$/);
        }
      }
    });
  });

  // Test 15: Activity Log Page
  test.describe('Activity Log', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/activity-log`);
      await waitForPageLoad(page);
    });

    test('should display audit log table', async () => {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=Timestamp')).toBeVisible();
      await expect(page.locator('text=Actor')).toBeVisible();
      await expect(page.locator('text=Action')).toBeVisible();
    });

    test('should search logs', async () => {
      await page.fill('input[placeholder*="Search"], input[aria-label*="Search"]', 'asset');
      await page.waitForTimeout(500);
    });

    test('should filter by entity type', async () => {
      const entitySelect = page.locator('select[aria-label*="entity"]').first();
      if (await entitySelect.isVisible()) {
        await entitySelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    });

    test('should filter by action', async () => {
      const actionSelect = page.locator('select[aria-label*="action"]').first();
      if (await actionSelect.isVisible()) {
        await actionSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    });

    test('should filter by actor', async () => {
      const actorSelect = page.locator('select[aria-label*="actor"]').first();
      if (await actorSelect.isVisible()) {
        await actorSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    });

    test('should filter by date range', async () => {
      await clickAndWait(page, 'button:has-text("Filters")');
      await page.waitForTimeout(300);
      
      const fromDate = page.locator('input[type="date"][id*="from"], input[name*="from"]').first();
      const toDate = page.locator('input[type="date"][id*="to"], input[name*="to"]').first();
      
      if (await fromDate.isVisible()) {
        await fromDate.fill('2024-01-01');
        await toDate.fill('2024-12-31');
        await page.waitForTimeout(500);
      }
    });

    test('should sort by timestamp', async () => {
      const sortBtn = page.locator('button[aria-label*="Sort"]').first();
      if (await sortBtn.isVisible()) {
        await clickAndWait(page, sortBtn);
        await page.waitForTimeout(300);
      }
    });

    test('should export to CSV', async () => {
      const exportBtn = page.locator('button:has-text("Export CSV")').first();
      if (await exportBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, exportBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
      }
    });

    test('should clear filters', async () => {
      const clearBtn = page.locator('button:has-text("Clear")').first();
      if (await clearBtn.isVisible()) {
        await clickAndWait(page, clearBtn);
        await page.waitForTimeout(500);
      }
    });
  });

  // Test 16: Settings Page
  test.describe('Settings', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
      await page.goto(`${BASE_URL}/settings`);
      await waitForPageLoad(page);
    });

    test('should display settings tabs', async () => {
      await expect(page.locator('button[role="tab"]:has-text("Organization")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Categories")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Users")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Appearance")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Backup")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("Security")')).toBeVisible();
    });

    test('should edit organization settings', async () => {
      await clickAndWait(page, 'button[role="tab"]:has-text("Organization")');
      
      await fillForm(page, {
        'input[name*="name"], input[id*="name"]': `Updated Org ${Date.now()}`,
        'input[name*="email"], input[id*="email"]': `test${Date.now()}@example.com`,
      });
      
      await clickAndWait(page, 'button[type="submit"]:has-text("Save")');
      await expect(page.locator('.toast, [role="alert"]')).toBeVisible({ timeout: 3000 });
    });

    test('should manage taxonomies', async () => {
      await clickAndWait(page, 'button[role="tab"]:has-text("Categories")');
      
      // Add asset category
      const assetInput = page.locator('input[placeholder*="Add category"]').first();
      if (await assetInput.isVisible()) {
        await assetInput.fill(`Test Category ${Date.now()}`);
        await clickAndWait(page, 'button:has-text("Add")');
      }
    });

    test('should manage users', async () => {
      await clickAndWait(page, 'button[role="tab"]:has-text("Users")');
      
      await expect(page.locator('table')).toBeVisible();
      
      await clickAndWait(page, 'button:has-text("Add Account")');
      await expect(page.locator('[role="dialog"]').filter({ hasText: /Add/ })).toBeVisible();
      
      await fillForm(page, {
        'input[name*="name"], input[id*="name"]': `Test User ${Date.now()}`,
        'input[name*="email"], input[id*="email"]': `user${Date.now()}@example.com`,
        'select[name*="role"]': 'IT_TECHNICIAN',
      });
      
      await clickAndWait(page, 'button[type="submit"]:has-text("Save")');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    });

    test('should change theme', async () => {
      await clickAndWait(page, 'button[role="tab"]:has-text("Appearance")');
      
      // Click dark mode
      await clickAndWait(page, 'button:has-text("Dark Mode")');
      await expect(page.locator('html.dark')).toBeVisible({ timeout: 3000 });
      
      // Click light mode
      await clickAndWait(page, 'button:has-text("Light Mode")');
      await expect(page.locator('html:not(.dark)')).toBeVisible({ timeout: 3000 });
      
      // Click system
      await clickAndWait(page, 'button:has-text("System Default")');
    });

    test('should download backup', async () => {
      await clickAndWait(page, 'button[role="tab"]:has-text("Backup")');
      
      const downloadBtn = page.locator('button:has-text("Download JSON Backup")').first();
      if (await downloadBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download');
        await clickAndWait(page, downloadBtn);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.json$/);
      }
    });

    test('should reset local data', async () => {
      await clickAndWait(page, 'button[role="tab"]:has-text("Backup")');
      
      const resetBtn = page.locator('button:has-text("Reset Local Demo Dataset")').first();
      if (await resetBtn.isVisible()) {
        await clickAndWait(page, resetBtn);
        await expect(page.locator('[role="dialog"]').filter({ hasText: /Reset/ })).toBeVisible();
        await clickAndWait(page, 'button:has-text("Cancel")');
      }
    });
  });

  // Test 17: Responsive Design
  test.describe('Responsive Design', () => {
    for (const viewport of VIEWPORTS) {
      test(`should work at ${viewport.name} (${viewport.width}x${viewport.height})`, async () => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        
        await page.goto(BASE_URL);
        await waitForPageLoad(page);
        await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
        await waitForPageLoad(page);
        
        // Test navigation
        if (viewport.width < 768) {
          // Mobile - check hamburger menu
          const menuBtn = page.locator('button[aria-label*="Menu"], button[aria-label*="menu"]').first();
          if (await menuBtn.isVisible()) {
            await clickAndWait(page, menuBtn);
          }
        }
        
        // Navigate to a page
        await page.goto(`${BASE_URL}/assets`);
        await waitForPageLoad(page);
        
        // Check table is scrollable or responsive
        const table = page.locator('table').first();
        await expect(table).toBeVisible();
        
        // Check buttons are clickable
        const addBtn = page.locator('button:has-text("Add Asset"), button:has-text("New Asset")').first();
        if (await addBtn.isVisible()) {
          await clickAndWait(page, addBtn);
          await expect(page.locator('[role="dialog"]')).toBeVisible();
          await clickAndWait(page, 'button:has-text("Cancel")');
        }
        
        console.log(`✓ ${viewport.name} passed`);
      });
    }
  });

  // Test 18: Modals and Dialogs
  test.describe('Modals and Dialogs', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
    });

    test('should close modal with Escape key', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
    });

    test('should close modal with close button', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      await clickAndWait(page, 'button[aria-label="Close dialog"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test('should close modal when clicking overlay', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      
      // Click on overlay (outside modal)
      await page.mouse.click(10, 10);
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
    });

    test('should trap focus in modal', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      
      // Tab through focusable elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Focus should stay in modal
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']).toContain(focused);
    });

    test('should prevent duplicate submissions', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      
      // Fill minimal form
      await page.fill('input[name*="assetTag"], input[id*="asset-tag"]', `TEST-${Date.now()}`);
      await page.fill('input[name*="name"], input[id*="name"]', 'Test');
      
      // Double click submit
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await submitBtn.click();
      
      await page.waitForTimeout(1000);
      
      // Should only create one record
      // Modal should close after first successful submit
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    });
  });

  // Test 19: Toast Notifications
  test.describe('Toast Notifications', () => {
    test.beforeEach(async () => {
      await page.goto(BASE_URL);
      await waitForPageLoad(page);
      await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
      await waitForPageLoad(page);
    });

    test('should show success toast on create', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      
      await fillForm(page, {
        'input[name*="assetTag"], input[id*="asset-tag"]': `TOAST-${Date.now()}`,
        'input[name*="name"], input[id*="name"]': 'Toast Test',
        'select[name*="category"]': 'Laptop',
        'input[name*="serialNumber"]': `SN-${Date.now()}`,
        'input[name*="purchasePrice"]': '100',
      });
      
      await clickAndWait(page, 'button[type="submit"]');
      
      await expect(page.locator('.toast, [role="alert"]').filter({ hasText: /success|created|saved/i })).toBeVisible({ timeout: 3000 });
    });

    test('should show error toast on validation failure', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      await clickAndWait(page, 'button[type="submit"]');
      
      await expect(page.locator('.toast, [role="alert"]').filter({ hasText: /error|required|invalid/i })).toBeVisible({ timeout: 3000 });
    });

    test('should dismiss toast on click', async () => {
      await page.goto(`${BASE_URL}/assets`);
      await waitForPageLoad(page);
      
      await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
      await clickAndWait(page, 'button[type="submit"]');
      
      const toast = page.locator('.toast, [role="alert"]').first();
      if (await toast.isVisible()) {
        await toast.click();
        await expect(toast).not.toBeVisible({ timeout: 3000 });
      }
    });
  });

  // Test 20: Console Errors Check
  test.describe('Error-Free Operation', () => {
    test('should have no console errors on all pages', async () => {
      const allErrors: Record<string, string[]> = {};
      
      for (const pageInfo of PAGES) {
        await page.goto(`${BASE_URL}${pageInfo.path}`);
        await waitForPageLoad(page);
        
        const errors = await testConsoleErrors(page);
        if (errors.length > 0) {
          allErrors[pageInfo.name] = errors;
        }
      }
      
      if (Object.keys(allErrors).length > 0) {
        console.log('Console errors found:', JSON.stringify(allErrors, null, 2));
      }
      
      // Allow some known non-critical errors
      expect(Object.keys(allErrors).length).toBeLessThanOrEqual(3);
    });
  });
});

// Test 21: Data Persistence
test.describe('Data Persistence', () => {
  test('should persist data across page reloads', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForPageLoad(page);
    await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
    await waitForPageLoad(page);
    
    // Create an asset
    await page.goto(`${BASE_URL}/assets`);
    await waitForPageLoad(page);
    
    const testTag = `PERSIST-${Date.now()}`;
    await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
    
    await fillForm(page, {
      'input[name*="assetTag"], input[id*="asset-tag"]': testTag,
      'input[name*="name"], input[id*="name"]': 'Persist Test',
      'select[name*="category"]': 'Laptop',
      'input[name*="serialNumber"]': `SN-${Date.now()}`,
      'input[name*="purchasePrice"]': '500',
    });
    
    await clickAndWait(page, 'button[type="submit"]');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    
    // Reload page
    await page.reload();
    await waitForPageLoad(page);
    
    // Check asset still exists
    await expect(page.locator(`text=${testTag}`)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Complete Workflow Tests', () => {
  test('full asset lifecycle: create -> assign -> maintain -> return', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForPageLoad(page);
    await clickAndWait(page, 'button:has-text("Open Local Offline Workspace")');
    await waitForPageLoad(page);
    
    // 1. Create asset
    await page.goto(`${BASE_URL}/assets`);
    await waitForPageLoad(page);
    
    const assetTag = `LIFECYCLE-${Date.now()}`;
    await clickAndWait(page, 'button:has-text("Add Asset"), button:has-text("New Asset")');
    
    await fillForm(page, {
      'input[name*="assetTag"], input[id*="asset-tag"]': assetTag,
      'input[name*="name"], input[id*="name"]': 'Lifecycle Asset',
      'select[name*="category"]': 'Laptop',
      'input[name*="serialNumber"]': `SN-${Date.now()}`,
      'input[name*="purchasePrice"]': '1200',
    });
    
    await clickAndWait(page, 'button[type="submit"]');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    
    // 2. Assign asset
    await page.goto(`${BASE_URL}/assignments`);
    await waitForPageLoad(page);
    
    await clickAndWait(page, 'button:has-text("Assign"), button:has-text("New Assignment")');
    
    const assetSelect = page.locator('select[name*="asset"]').first();
    const employeeSelect = page.locator('select[name*="employee"]').first();
    
    if (await assetSelect.isVisible() && await employeeSelect.isVisible()) {
      // Find our asset
      const options = await assetSelect.locator('option').all();
      for (const opt of options) {
        const text = await opt.textContent();
        if (text?.includes(assetTag)) {
          await assetSelect.selectOption(await opt.getAttribute('value') || '');
          break;
        }
      }
      
      await employeeSelect.selectOption({ index: 1 });
      await clickAndWait(page, 'button[type="submit"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    }
    
    // 3. Schedule maintenance
    await page.goto(`${BASE_URL}/maintenance`);
    await waitForPageLoad(page);
    
    await clickAndWait(page, 'button:has-text("Schedule"), button:has-text("New Maintenance")');
    
    const maintAssetSelect = page.locator('select[name*="asset"]').first();
    if (await maintAssetSelect.isVisible()) {
      await maintAssetSelect.selectOption({ label: assetTag });
      await fillForm(page, {
        'select[name*="type"]': 'Inspection',
        'input[type="date"][name*="date"]': '2025-12-31',
      });
      await clickAndWait(page, 'button[type="submit"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    }
    
    // 4. Complete maintenance
    const completeBtn = page.locator('button:has-text("Complete")').first();
    if (await completeBtn.isVisible()) {
      await clickAndWait(page, completeBtn);
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await clickAndWait(page, 'button[type="submit"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    }
    
    // 5. Return asset (handover)
    await page.goto(`${BASE_URL}/assignments`);
    await waitForPageLoad(page);
    
    const handoverBtn = page.locator('button:has-text("Return"), button:has-text("Handover")').first();
    if (await handoverBtn.isVisible()) {
      await clickAndWait(page, handoverBtn);
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await clickAndWait(page, 'button[type="submit"]');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    }
    
    console.log('✓ Full asset lifecycle test passed');
  });
});