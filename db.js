// Initialize Dexie
const db = new Dexie("MirageDB");

// Define Schema
// Define Schema
// Define Schema
// Define Schema
db.version(7).stores({
    products: '++id, name, category, vendor, costPrice, retailPrice, wholesalePrice, stock',
    sales: '++id, invoiceNo, date, customerType, totalAmount, profit, deliveryCharge',
    quotations: '++id, quotationNo, date, customerName, totalAmount',
    shipments: '++id, shipmentId, date, vendor, totalCost, exchangeRate, itemCount, status',
    settings: 'id, lastInvoiceNo, lastQuotationNo, lastShipmentId',
    vendors: '++id, name, contact',
    users: '++id, username, password, role'
}).upgrade(tx => {
    // Force seed admin user on upgrade
    tx.users.count().then(count => {
        if (count === 0) {
            tx.users.add({ username: 'Administrator', password: 'Campion#123', role: 'admin' });
        }
    });
});

// Seed data if empty
db.on('populate', () => {
    db.settings.add({ id: 'config', lastInvoiceNo: 0, lastQuotationNo: 0, lastShipmentId: 0 });
    db.vendors.bulkAdd([
        { name: "General Vendor", contact: "N/A" },
        { name: "Saman Crafts", contact: "077-1234567" }
    ]);
    db.users.add({ username: 'Administrator', password: 'Campion#123', role: 'admin' });
});

// DB Helper Functions
const DB = {
    // Products
    async addProduct(product) {
        return await db.products.add(product);
    },

    async getProducts() {
        return await db.products.toArray();
    },

    async updateProduct(id, updates) {
        return await db.products.update(id, updates);
    },

    async deleteProduct(id) {
        return await db.products.delete(id);
    },

    async updateStock(id, qtyChange) {
        const product = await db.products.get(id);
        if (product) {
            const newStock = product.stock - qtyChange;
            await db.products.update(id, { stock: newStock });
        }
    },

    // Vendors
    async getVendors() {
        return await db.vendors.toArray();
    },

    async addVendor(vendor) {
        return await db.vendors.add(vendor);
    },

    // Sales
    async getNextInvoiceNo() {
        const config = await db.settings.get('config');
        const nextNo = (config ? config.lastInvoiceNo : 0) + 1;
        return `INV-${new Date().getFullYear()}-${String(nextNo).padStart(4, '0')}`;
    },

    async saveSale(saleData) {
        return await db.transaction('rw', db.sales, db.products, db.settings, async () => {
            // 1. Save Sale Record
            await db.sales.add(saleData);

            // 2. Decrement Stock
            for (const item of saleData.items) {
                await this.updateStock(item.productId, item.qty);
            }

            // 3. Update Invoice Counter (Only if new number is higher)
            const currentInvoiceNo = parseInt(saleData.invoiceNo.split('-').pop());
            const config = await db.settings.get('config');
            if (currentInvoiceNo > (config?.lastInvoiceNo || 0)) {
                await db.settings.update('config', { lastInvoiceNo: currentInvoiceNo });
            }
        });
    },

    async deleteSale(id) {
        return await db.transaction('rw', db.sales, db.products, async () => {
            const sale = await db.sales.get(id);
            if (!sale) throw new Error("Sale not found");

            // Restore Stock
            for (const item of sale.items) {
                const product = await db.products.get(item.productId);
                if (product) {
                    await db.products.update(item.productId, { stock: product.stock + item.qty });
                }
            }

            // Delete Sale
            await db.sales.delete(id);
        });
    },

    async getSales() {
        return await db.sales.reverse().toArray(); // Newest first
    },

    async getSalesByDate(dateString) {
        // Simple string match for YYYY-MM-DD
        const allSales = await db.sales.toArray();
        return allSales.filter(s => s.date.startsWith(dateString));
    },

    // Quotations
    async getQuotations() {
        return await db.quotations.reverse().toArray();
    },

    async addQuotation(data) {
        return await db.quotations.add(data);
    },

    async updateQuotation(id, updates) {
        return await db.quotations.update(id, updates);
    },

    async deleteQuotation(id) {
        return await db.quotations.delete(id);
    },

    async getNextQuotationNo() {
        // Simple counter based on existing count for now, or dedicated setting? 
        // Let's use a dedicated setting to be safe like invoices, or just count.
        // For simplicity/robustness, let's just count existing + 1 or random if we care less.
        // Better: Use settings like invoices.
        const config = await db.settings.get('config');
        const nextNo = (config ? (config.lastQuotationNo || 0) : 0) + 1;
        return `QTN-${new Date().getFullYear()}-${String(nextNo).padStart(4, '0')}`;
    },

    async incrementQuotationNo() {
        const config = await db.settings.get('config');
        const current = config?.lastQuotationNo || 0;
        await db.settings.update('config', { lastQuotationNo: current + 1 });
    },

    // Shipments
    async getShipments() {
        return await db.shipments.reverse().toArray();
    },

    async getNextShipmentId() {
        const config = await db.settings.get('config');
        const nextNo = (config ? (config.lastShipmentId || 0) : 0) + 1;
        return `SHP-${new Date().getFullYear()}-${String(nextNo).padStart(4, '0')}`;
    },

    async saveShipment(shipmentData, productsToAdd) {
        return await db.transaction('rw', db.shipments, db.products, db.settings, async () => {
            // 1. Add Shipment
            await db.shipments.add(shipmentData);

            // 2. Add Products
            if (productsToAdd && productsToAdd.length > 0) {
                await db.products.bulkAdd(productsToAdd);
            }

            // 3. Update Shipment Counter
            const currentId = parseInt(shipmentData.shipmentId.split('-').pop());
            const config = await db.settings.get('config');
            if (currentId > (config?.lastShipmentId || 0)) {
                await db.settings.update('config', { lastShipmentId: currentId });
            }
        });
    },

    async deleteShipment(id) {
        // This only deletes the record, not the products added (complex to rollback individual products without linking them strictly)
        // User asked for "adjustments", assuming manual edits on products.
        // Or if we want strict rollback, we'd need to store product IDs in shipment.
        // For now, simple delete of record.
        return await db.shipments.delete(id);
    },

    // Users
    async getUsers() {
        return await db.users.toArray();
    },

    async addUser(user) {
        return await db.users.add(user);
    },

    async deleteUser(id) {
        return await db.users.delete(id);
    },

    async loginUser(username, password) {
        const user = await db.users.where('username').equals(username).first();
        if (user && user.password === password) {
            return user;
        }
        return null;
    },

    // Data Management
    async exportData() {
        const data = {
            products: await db.products.toArray(),
            sales: await db.sales.toArray(),
            quotations: await db.quotations.toArray(),
            shipments: await db.shipments.toArray(),
            vendors: await db.vendors.toArray(),
            settings: await db.settings.toArray(),
            users: await db.users.toArray() // Include users in backup
        };
        return JSON.stringify(data);
    },

    async importData(jsonString) {
        const data = JSON.parse(jsonString);
        await db.transaction('rw', db.products, db.sales, db.quotations, db.shipments, db.vendors, db.settings, db.users, async () => {
            await db.products.clear();
            await db.sales.clear();
            await db.quotations.clear();
            await db.shipments.clear();
            await db.vendors.clear();
            await db.settings.clear();
            await db.users.clear(); // Clear users on restore

            if (data.products) await db.products.bulkAdd(data.products);
            if (data.sales) await db.sales.bulkAdd(data.sales);
            if (data.quotations) await db.quotations.bulkAdd(data.quotations);
            if (data.shipments) await db.shipments.bulkAdd(data.shipments);
            if (data.vendors) await db.vendors.bulkAdd(data.vendors);
            if (data.settings) await db.settings.bulkAdd(data.settings);
            if (data.users) await db.users.bulkAdd(data.users);
        });
    },

    async resetDatabase() {
        await db.delete();
        window.location.reload();
    },

    // Ensure Admin User Exists (Call on app init)
    async ensureAdminUser() {
        const users = await db.users.toArray();
        if (users.length === 0) {
            await db.users.add({ username: 'Administrator', password: 'Campion#123', role: 'admin' });
            console.log('Admin user created');
        }
    }
};
