# Project Plan: Mirage Fine Jewelery - POS System

## 1. Project Overview
A lightweight, browser-based Point of Sale (POS) system for **Mirage Fine Jewelery**. The system supports both Wholesale and Retail sales, inventory management, and invoice generation.

- **Developer Goal:** Build a functional POS using HTML, Tailwind CSS, and Dexie.js.
- **Data Storage:** Local-first (Browser's IndexedDB) for high speed and offline capability.

---

## 2. Business Requirements

### A. Inventory Management
* **Product Details:** Name, Category (Jewelry/Fancy), Vendor Name, Cost Price, Retail Price, Wholesale Price, and Stock Quantity.
* **Stock Tracking:** Automatically decrease stock when a sale is made.
* **Margin Calculation:** Ability to see the profit margin based on the cost price.

### B. Sales & Invoicing
* **Customer Types:** Toggle between "Retail" and "Wholesale" pricing during checkout.
* **Cart System:** Add multiple items to a single bill.
* **Invoice Generation:** * Unique Invoice Number (e.g., INV-2024-001).
    * Date and Time.
    * Print-friendly layout for the customer.

### C. Vendor Management
* Keep a simple directory of vendors from whom jewelry is purchased.

### D. Reporting
* Daily Sales Summary (Total revenue and profit).
* Low Stock Alerts (Items below a certain quantity).

---

## 3. Technical Requirements & Architecture

### A. Tech Stack
* **Frontend:** HTML5, Tailwind CSS (via CDN for simplicity).
* **Logic:** Vanilla JavaScript (ES6+).
* **Database:** [Dexie.js](https://dexie.org/) (Wrapper for IndexedDB).

### B. Database Schema (Dexie.js)
Define these tables in your JS file:
* `products`: `++id, name, category, vendor, costPrice, retailPrice, wholesalePrice, stock`
* `sales`: `++id, invoiceNo, date, customerType, items, totalAmount, profit`
* `settings`: `id, lastInvoiceNo`

---

## 4. Feature Implementation Instructions

### Step 1: UI Layout (Tailwind CSS)
* **Dashboard:** Simple cards showing total stock and today’s sales.
* **Inventory Page:** A table to show items with an "Add Product" modal.
* **POS Page:** * Left side: Product search and list.
    * Right side: Cart/Bill preview.
* **Invoice Template:** A hidden `div` that only appears during the `window.print()` command.

### Step 2: Database Logic (Dexie.js)
1.  Initialize the database: `const db = new Dexie("MirageDB");`
2.  Create functions for:
    * `addProduct(data)`
    * `updateStock(id, qty)`
    * `getProducts()`
    * `saveSale(saleData)`

### Step 3: Sales Logic
1.  **Search:** Use a simple JavaScript `.filter()` to find products by name as you type.
2.  **Calculation:** * If "Retail" is selected, use `retailPrice`.
    * If "Wholesale" is selected, use `wholesalePrice`.
3.  **Invoice Number:** On every sale, fetch the `lastInvoiceNo` from the settings table, increment it, and save it back.

### Step 4: Printing
* Use CSS `@media print` to hide the navigation bar and buttons, showing only the invoice area when printing.

---

## 5. Security & Maintenance
* **Data Backup:** Add a "Backup" button that exports the Dexie.js database as a JSON file.
* **Data Restore:** Add an "Import" button to upload the JSON file if you change computers.
* **Browser Storage:** Remind the user NOT to clear browser "Site Data" as it will delete the database.

---

## 6. Implementation Roadmap
1. [ ] Setup basic HTML with Tailwind CDN.
2. [ ] Configure Dexie.js and create the `products` table.
3. [ ] Build the Inventory UI (Add/Edit/Delete products).
4. [ ] Build the POS UI (Cart, Price Toggle, Search).
5. [ ] Implement Invoice Generation and Printing.
6. [ ] Add a simple Dashboard for sales reports.