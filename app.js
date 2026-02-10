// --- Global State ---
const State = {
    cart: [],
    priceType: 'retail', // 'retail' or 'wholesale'
    products: [],
    sales: [],
    quotations: [],
    shipments: [],
    vendors: [],
    users: [],
    currentUser: null, // Track logged in user
    editingSale: null, // Track if editing an existing sale
    editingQuotation: null // Track if editing a quotation
};

// --- Broadcast Channel for Cross-Tab Sync ---
const channel = new BroadcastChannel('mirage_pos_sync');

channel.onmessage = async (event) => {
    if (event.data === 'refresh') {
        console.log("Received sync event, refreshing...");
        await refreshAppState();
    }
};

// --- Initialization ---
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await DB.ensureAdminUser(); // Ensure admin exists
    checkAuth(); // Wait for user login
});

async function init() {
    lucide.createIcons();
    updateClock();
    setInterval(updateClock, 1000);

    await loadInitialData();

    // Show User Management nav only for admin
    if (State.currentUser && State.currentUser.role === 'admin') {
        document.getElementById('nav-users')?.classList.remove('hidden');
    }

    navigateTo('dashboard');
}


async function loadInitialData() {
    await refreshAppState();
    // Populate dropdowns once
    populateVendorSelect();
}

async function refreshAppState() {
    // 1. Fetch Latest Data
    State.products = await DB.getProducts();
    State.sales = await DB.getSales();
    State.quotations = await DB.getQuotations();
    State.shipments = await DB.getShipments();
    State.shipments = await DB.getShipments();
    State.vendors = await DB.getVendors();
    State.users = await DB.getUsers();

    // 2. Re-render ALL Views (Safely)
    try { renderDashboard(); } catch (e) { console.error("Dash Error", e); }
    try { renderInventory(); } catch (e) { console.error("Inv Error", e); }
    try { renderPOS(); } catch (e) { console.error("POS Error", e); }
    try { renderSalesHistory(); } catch (e) { console.error("Sales Error", e); }
    try { renderQuotations(); } catch (e) { console.error("Quotations Error", e); }
    try { renderShipments(); } catch (e) { console.error("Shipments Error", e); }
    try { renderVendors(); } catch (e) { console.error("Vendor Error", e); }
    try { renderCart(); } catch (e) { console.error("Cart Error", e); }
}

async function deleteSale(id) {
    if (confirm("Are you sure? This will delete the sale and RESTORE the stock quantity.")) {
        // Optimistic UI Update: Remove immediately for visual feedback
        const el = document.querySelector(`button[onclick="deleteSale(${id})"]`).closest('tr');
        if (el) el.style.opacity = '0.3'; // Visual cue

        try {
            await DB.deleteSale(id);

            // Manually remove from local state first (backup)
            State.sales = State.sales.filter(s => s.id !== id);
            renderSalesHistory();

            showToast("Sale deleted and stock restored");
            await refreshAppState(); // Full sync
            channel.postMessage('refresh');
        } catch (err) {
            console.error(err);
            if (el) el.style.opacity = '1'; // Revert if failed
            showToast("Error deleting sale", "error");
        }
    }
}

// --- Navigation ---
async function navigateTo(viewId) {
    // 1. Update Active Nav State
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-slate-800', 'text-white', 'shadow-lg');
        el.classList.add('text-slate-400');
    });

    const activeNav = document.getElementById(`nav-${viewId}`);
    if (activeNav) {
        activeNav.classList.add('bg-slate-800', 'text-white', 'shadow-lg');
        activeNav.classList.remove('text-slate-400');
    }

    // 2. Switch Views with Animation
    document.querySelectorAll('.view').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('animate-fade-in');
    });

    const view = document.getElementById(`view-${viewId}`);
    if (view) {
        view.classList.remove('hidden');
        view.classList.add('animate-fade-in');

        // Refresh specific view data
        // Refresh specific view data with FRESH DB fetch
        if (viewId === 'dashboard') {
            State.sales = await DB.getSales(); // Fetch fresh sales
            renderDashboard();
        }
        if (viewId === 'inventory') {
            State.products = await DB.getProducts(); // Fetch fresh products
            renderInventory();
        }
        if (viewId === 'pos') {
            State.products = await DB.getProducts(); // Fetch fresh stock
            renderPOS();
        }
        if (viewId === 'sales') {
            State.sales = await DB.getSales(); // Fetch fresh history
            renderSalesHistory();
        }
        if (viewId === 'quotations') {
            State.quotations = await DB.getQuotations();
            renderQuotations();
        }
        if (viewId === 'shipments') {
            State.shipments = await DB.getShipments();
            renderShipments();
        }
        if (viewId === 'reports') {
            await refreshAppState();
            renderReports();
        }
        if (viewId === 'vendors') {
            renderVendors(); // internally fetches
        }
    }

    // 3. Update Header Title
    const titleMap = {
        'dashboard': 'Dashboard Overview',
        'pos': 'Point of Sale Terminal',
        'inventory': 'Inventory Management',
        'sales': 'Sales & Invoices',
        'quotations': 'Quotations & Estimates',
        'shipments': 'Shipment History',
        'vendors': 'Vendor Directory',
        'reports': 'Financial Reports & Analytics',
        'users': 'User Management',
        'settings': 'System Settings'
    };
    document.getElementById('page-title').textContent = titleMap[viewId] || 'PosMini';

    // 4. Admin-only check for User Management
    if (viewId === 'users') {
        if (!State.currentUser || State.currentUser.role !== 'admin') {
            alert('Access Denied: Administrator privileges required');
            navigateTo('dashboard');
            return;
        }
        renderUsers();
    }
}

// --- Dashboard Logic ---
function renderDashboard() {
    const now = new Date();
    // Create local date string YYYY-MM-DD
    const localToday = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    // Filter by checking if local date string matches
    const todaySales = State.sales.filter(s => {
        const saleDate = new Date(s.date);
        const saleLocal = saleDate.getFullYear() + '-' + String(saleDate.getMonth() + 1).padStart(2, '0') + '-' + String(saleDate.getDate()).padStart(2, '0');
        return saleLocal === localToday;
    });

    const totalSales = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalProfit = todaySales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const lowStockCount = State.products.filter(p => p.stock < 5).length;

    document.getElementById('dash-today-sales').textContent = formatCurrency(totalSales);
    document.getElementById('dash-today-profit').textContent = formatCurrency(totalProfit);
    document.getElementById('dash-total-products').textContent = State.products.length;
    document.getElementById('dash-low-stock').textContent = lowStockCount;

    // Recent Sales Table (Top 5)
    const recentSalesBody = document.getElementById('dash-recent-sales');
    recentSalesBody.innerHTML = State.sales.slice(0, 5).map(sale => `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 font-mono text-slate-500">${sale.invoiceNo}</td>
            <td class="px-6 py-4">${sale.date.split('T')[0]}</td>
            <td class="px-6 py-4">${sale.items.length} items</td>
            <td class="px-6 py-4 text-right font-medium">${formatCurrency(sale.totalAmount)}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${sale.customerType === 'wholesale' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">
                    ${sale.customerType.charAt(0).toUpperCase() + sale.customerType.slice(1)}
                </span>
            </td>
        </tr>
    `).join('');
}

// --- Inventory Logic ---
function renderInventory() {
    const tbody = document.getElementById('inventory-list');
    const searchTerm = document.getElementById('inv-search').value.toLowerCase();

    const filtered = State.products.filter(p => p.name.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-500">No products found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-50">
            <td class="px-6 py-4 font-medium text-slate-900">${p.name}</td>
            <td class="px-6 py-4 text-slate-500">${p.category}</td>
            <td class="px-6 py-4 text-slate-500">${p.vendor || '-'}</td>
            <td class="px-6 py-4 text-slate-500">${formatCurrency(p.costPrice)}</td>
            <td class="px-6 py-4 font-medium text-green-600">${formatCurrency(p.retailPrice)}</td>
            <td class="px-6 py-4 font-medium text-blue-600">${formatCurrency(p.wholesalePrice)}</td>
            <td class="px-6 py-4">
                <span class="${p.stock < 5 ? 'text-red-500 font-bold' : 'text-slate-700'}">${p.stock}</span>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="editProduct(${p.id})" class="text-blue-500 hover:text-blue-700 mr-3 transition-colors">Edit</button>
                <button onclick="deleteProduct(${p.id})" class="text-red-400 hover:text-red-600 transition-colors">Delete</button>
            </td>
        </tr>
    `).join('');
}

// Search Listener for Inventory
document.getElementById('inv-search').addEventListener('input', renderInventory);

// Modal Handling
function openModal(modalId) {
    const m = document.getElementById(modalId);
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(() => m.classList.remove('opacity-0'), 10);
}

function closeModal(modalId) {
    const m = document.getElementById(modalId);
    m.classList.add('opacity-0');
    setTimeout(() => {
        m.classList.add('hidden');
        m.classList.remove('flex');
    }, 200);
}

// Add/Edit Product Logic
async function handleProductSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const name = document.getElementById('prod-name').value;
    const category = document.getElementById('prod-category').value;
    const vendor = document.getElementById('prod-vendor').value;
    const costPrice = parseFloat(document.getElementById('prod-cost').value);
    const retailPrice = parseFloat(document.getElementById('prod-retail').value);
    const wholesalePrice = parseFloat(document.getElementById('prod-wholesale').value);
    const stock = parseInt(document.getElementById('prod-stock').value);

    // Simple validation
    if (retailPrice < costPrice) {
        if (!confirm("Warning: Retail Price is lower than Cost Price. Continue?")) return;
    }

    const productData = { name, category, vendor, costPrice, retailPrice, wholesalePrice, stock };

    try {
        if (id) {
            await DB.updateProduct(parseInt(id), productData);
            showToast("Product updated successfully");
        } else {
            await DB.addProduct(productData);
            showToast("Product added successfully");
        }

        closeModal('modal-add-product');
        resetProductForm(); // Just reset, don't reopen!


        // Refresh Data & UI
        await refreshAppState();
        channel.postMessage('refresh'); // Notify other tabs
    } catch (err) {
        console.error("Error saving product:", err);
        alert("Failed to save product: " + err.message);
    }
}

function editProduct(id) {
    const p = State.products.find(x => x.id === id);
    if (!p) return;

    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-vendor').value = p.vendor || 'General';
    document.getElementById('prod-cost').value = p.costPrice;
    document.getElementById('prod-retail').value = p.retailPrice;
    document.getElementById('prod-wholesale').value = p.wholesalePrice;
    document.getElementById('prod-stock').value = p.stock;


    document.querySelector('#modal-add-product h3').textContent = 'Edit Product';
    openModal('modal-add-product');
}

function prepareAddProduct() {
    resetProductForm();
    openModal('modal-add-product');
}

function resetProductForm() {
    document.getElementById('form-add-product').reset();
    document.getElementById('prod-id').value = '';
    // Reset title
    document.querySelector('#modal-add-product h3').textContent = 'Add New Product';
}

async function deleteProduct(id) {
    if (confirm("Are you sure you want to delete this product?")) {
        await DB.deleteProduct(id);
        await refreshAppState();
        channel.postMessage('refresh');
        showToast("Product deleted");
    }
}


// --- POS Functionality ---
function renderPOS() {
    const grid = document.getElementById('pos-product-grid');
    const searchTerm = document.getElementById('pos-search').value.toLowerCase();
    const catFilter = document.getElementById('pos-category-filter').value;

    let filtered = State.products;
    if (catFilter !== 'all') filtered = filtered.filter(p => p.category === catFilter);
    if (searchTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400">
            <i data-lucide="package-search" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
            <p>No products found matching your search.</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    grid.innerHTML = filtered.map(p => `
        <div onclick="addToCart(${p.id})" class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-accent/30 cursor-pointer transition-all active:scale-[0.98] group relative overflow-hidden">
             <div class="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
             
             <div class="flex justify-between items-start mb-2 relative z-10">
                <span class="text-xs font-bold px-2 py-1 bg-gray-100 rounded-md text-gray-500">${p.category}</span>
                <span class="text-xs ${p.stock > 0 ? 'text-green-600' : 'text-red-500'} font-medium">Qty: ${p.stock}</span>
            </div>
            
            <h4 class="font-semibold text-slate-800 mb-1 relative z-10 leading-snug break-words" title="${p.name}">${p.name}</h4>
            <p class="text-accent font-bold relative z-10 group-hover:scale-110 transition-transform origin-left">
                ${formatCurrency(State.priceType === 'retail' ? p.retailPrice : p.wholesalePrice)}
            </p>
        </div>
    `).join('');
}

document.getElementById('pos-search').addEventListener('input', renderPOS);
document.getElementById('pos-category-filter').addEventListener('change', renderPOS);

function setPriceType(type) {
    State.priceType = type;

    // Update Button Styles
    const btnRetail = document.getElementById('btn-retail');
    const btnWholesale = document.getElementById('btn-wholesale');

    if (type === 'retail') {
        btnRetail.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
        btnRetail.classList.remove('text-gray-500', 'hover:text-slate-900');

        btnWholesale.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
        btnWholesale.classList.add('text-gray-500', 'hover:text-slate-900');
    } else {
        btnWholesale.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
        btnWholesale.classList.remove('text-gray-500', 'hover:text-slate-900');

        btnRetail.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
        btnRetail.classList.add('text-gray-500', 'hover:text-slate-900');
    }

    renderPOS(); // Re-render prices in grid
    renderCart(); // Re-calculate cart totals
}

function addToCart(productId) {
    const product = State.products.find(p => p.id === productId);
    if (!product) return;

    if (product.stock <= 0) {
        showToast("Item out of stock!", "error");
        return;
    }

    const existing = State.cart.find(item => item.productId === productId);

    if (existing) {
        if (existing.qty >= product.stock) {
            showToast("Max stock reached for this item", "error");
            return;
        }
        existing.qty++;
    } else {
        State.cart.push({
            productId: product.id,
            name: product.name,
            qty: 1,
            costPrice: product.costPrice,
            // Store reference prices, but actual calculation happens in render/checkout usually
            // For simplicity, let's store base prices
            retailPrice: product.retailPrice,
            wholesalePrice: product.wholesalePrice
        });
    }

    renderCart();
    // Tiny feedback
    const card = document.activeElement;
    if (card) {
        card.classList.add('ring-2', 'ring-accent');
        setTimeout(() => card.classList.remove('ring-2', 'ring-accent'), 200);
    }
}

function renderCart() {
    const container = document.getElementById('pos-cart-items');
    if (!container) return; // Guard clause

    if (State.cart.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-gray-400">
                <i data-lucide="shopping-cart" class="w-12 h-12 mx-auto mb-2 opacity-50"></i>
                <p class="text-xs">Empty</p>
            </div>
        `;
        document.getElementById('cart-count').textContent = '0';
        document.getElementById('cart-total').textContent = '0.00';
        lucide.createIcons();
        return;
    }

    let totalAmount = 0;
    let totalQty = 0;

    container.innerHTML = State.cart.map((item, index) => {
        const price = State.priceType === 'retail' ? item.retailPrice : item.wholesalePrice; // Use State.priceType, but item stores cost/prices
        // Actually, item stores retailPrice/wholesalePrice from product. 
        // We generally use State.priceType to switch display price.
        // Let's assume price switching applies to all items in cart dynamically or items stick to added price?
        // Usually in this app, priceType is global toggle.

        const lineTotal = price * item.qty;
        totalAmount += lineTotal;
        totalQty += item.qty;

        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl group relative border border-gray-100 mb-1">
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-slate-700 text-xs truncate mb-0.5">${item.name}</h4>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-500 font-medium">${formatCurrency(price)} x ${item.qty}</span>
                     </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-bold text-slate-900 text-sm">${formatCurrency(lineTotal)}</span>
                    
                    <!-- Remove Button -->
                    <button onclick="removeFromCart(${index})" class="text-gray-300 hover:text-red-500 transition-colors">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                    
                    <!-- Hover Quantity Controls -->
                     <div class="absolute right-0 top-0 bottom-0 bg-white/90 backdrop-blur shadow-sm flex items-center gap-2 px-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto border border-gray-100">
                        <button onclick="updateCartQty(${index}, -1)" class="w-6 h-6 rounded-md bg-gray-100 hover:bg-red-100 text-slate-600 hover:text-red-600 flex items-center justify-center font-bold">−</button>
                        <span class="text-xs font-bold w-4 text-center">${item.qty}</span>
                        <button onclick="updateCartQty(${index}, 1)" class="w-6 h-6 rounded-md bg-gray-100 hover:bg-green-100 text-slate-600 hover:text-green-600 flex items-center justify-center font-bold">+</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('cart-count').textContent = totalQty;
    document.getElementById('cart-total').textContent = formatCurrency(totalAmount);

    lucide.createIcons();
}

// updateCartQty & removeFromCart Logic
function updateCartQty(index, change) {
    const item = State.cart[index];
    // Find product to check stock
    // Since item doesn't store full product reference, we might need to find it by ID. or Trust it.
    // Better find it.
    const product = State.products.find(p => p.id === item.productId);

    const newQty = item.qty + change;

    if (newQty <= 0) {
        removeFromCart(index);
        return;
    }

    if (product && newQty > product.stock) {
        showToast("Not enough stock available", "error");
        return;
    }

    item.qty = newQty;
    renderCart();
}

function removeFromCart(index) {
    State.cart.splice(index, 1);
    renderCart();
}

function clearCart() {
    if (confirm("Clear current cart?")) {
        State.cart = [];
        State.editingSale = null;
        State.editingQuotation = null;
        renderCart();
        showToast("Cart cleared");
    }
}

// --- Quotation Logic ---

async function saveQuotation() {
    if (State.cart.length === 0) {
        showToast("Cart is empty!", "error");
        return;
    }

    // Capture Details
    const deliveryInput = document.getElementById('cart-delivery');
    const deliveryCharge = deliveryInput ? parseFloat(deliveryInput.value || 0) : 0;

    const discType = document.getElementById('cart-discount-type').value;
    const discInput = document.getElementById('cart-discount-value');
    const discVal = parseFloat(discInput ? discInput.value : 0) || 0;

    // Subtotal
    let subtotal = 0;
    State.cart.forEach(item => {
        const price = State.priceType === 'wholesale' ? item.wholesalePrice : item.retailPrice;
        subtotal += price * item.qty;
    });

    let discountAmount = 0;
    if (discType === 'percent') {
        discountAmount = subtotal * (discVal / 100);
    } else {
        discountAmount = discVal;
    }

    const totalAmount = Math.max(0, subtotal + deliveryCharge - discountAmount);

    const custNameInput = document.getElementById('cart-cust-name');
    const custAddrInput = document.getElementById('cart-cust-address');
    const customerName = custNameInput ? custNameInput.value.trim() : '';
    const customerAddress = custAddrInput ? custAddrInput.value.trim() : '';

    const itemsToSave = State.cart.map(item => {
        const price = State.priceType === 'wholesale' ? item.wholesalePrice : item.retailPrice;
        return {
            productId: item.productId,
            name: item.name,
            qty: item.qty,
            unitPrice: price,
            total: price * item.qty
        };
    });

    let quotationNo;
    let idToUpdate;

    if (State.editingQuotation) {
        quotationNo = State.editingQuotation.quotationNo;
        idToUpdate = State.editingQuotation.id;
    } else {
        quotationNo = await DB.getNextQuotationNo();
    }

    const quoteData = {
        quotationNo,
        date: new Date().toISOString(),
        customerType: State.priceType,
        customerName,
        customerAddress,
        items: itemsToSave,
        totalAmount,
        deliveryCharge,
        discountType: discType,
        discountValue: discVal,
        discountAmount
    };

    try {
        if (idToUpdate) {
            await DB.updateQuotation(idToUpdate, quoteData);
            showToast("Quotation updated: " + quotationNo);
        } else {
            await DB.addQuotation(quoteData);
            if (!State.editingQuotation) await DB.incrementQuotationNo(); // Only inc if new
            showToast("Quotation saved: " + quotationNo);
        }

        // Clear Cart
        State.cart = [];
        State.editingQuotation = null;
        if (deliveryInput) deliveryInput.value = 0;
        if (custNameInput) custNameInput.value = '';
        if (discInput) discInput.value = 0;

        await refreshAppState();
        channel.postMessage('refresh');
    } catch (e) {
        console.error(e);
        showToast("Error saving quotation", "error");
    }
}

function renderQuotations() {
    const tbody = document.getElementById('quotations-list');
    if (!tbody) return;

    const searchTerm = document.getElementById('quotes-search').value.toLowerCase();
    const filtered = State.quotations.filter(q => q.quotationNo.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-400">No quotations found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(q => `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-50">
            <td class="px-6 py-4 font-mono text-slate-500">${q.quotationNo}</td>
            <td class="px-6 py-4">${new Date(q.date).toLocaleDateString()}</td>
            <td class="px-6 py-4">${q.customerName || '-'}</td>
            <td class="px-6 py-4 text-right font-medium">${formatCurrency(q.totalAmount)}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">Pending</span>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="loadQuotation(${q.id})" class="text-blue-500 hover:text-blue-700 mr-2 font-medium text-xs border border-blue-200 px-2 py-1 rounded hover:bg-blue-50 transition-all">
                    Load / Convert
                </button>
                <button onclick="deleteQuotation(${q.id})" class="text-red-400 hover:text-red-600 transition-colors p-1">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

document.getElementById('quotes-search')?.addEventListener('input', renderQuotations);

async function loadQuotation(id) {
    const quote = State.quotations.find(q => q.id === id);
    if (!quote) return;

    if (!confirm(`Load Quotation ${quote.quotationNo} into POS? \nCurrent cart will be cleared.`)) return;

    State.cart = [];

    // Set Editing Quoation ID so "Save Quotation" updates it instead of new
    // BUT "Checkout" will create a NEW Sale.
    State.editingQuotation = quote;
    State.editingSale = null;

    // Load Items (Re-verify product existence optionally)
    quote.items.forEach(item => {
        const product = State.products.find(p => p.id === item.productId);
        if (product) {
            State.cart.push({
                productId: product.id,
                name: product.name,
                qty: item.qty,
                costPrice: product.costPrice,
                retailPrice: product.retailPrice, // Use current price or frozen price? Usually frozen for Quotes but here system is dynamic. Let's use current from DB to be safe for stock, but maybe the quote price was different? 
                // For simplicity, let's use the DB price, but maybe we should respect the quote price if we stored it properly.
                // Our cart uses "retailPrice" from product usually. 
                // Let's stick to Product Current Price to avoid discrepancies, OR warn.
                wholesalePrice: product.wholesalePrice
            });
        }
    });

    setPriceType(quote.customerType);

    const delInput = document.getElementById('cart-delivery');
    if (delInput) delInput.value = quote.deliveryCharge || 0;

    const custNameInput = document.getElementById('cart-cust-name');
    const custAddrInput = document.getElementById('cart-cust-address');
    if (custNameInput) custNameInput.value = quote.customerName || '';
    if (custAddrInput) custAddrInput.value = quote.customerAddress || '';

    const discTypeSelect = document.getElementById('cart-discount-type');
    const discInput = document.getElementById('cart-discount-value');
    if (discTypeSelect) discTypeSelect.value = quote.discountType || 'fixed';
    if (discInput) discInput.value = quote.discountValue || 0;

    calculateCartTotal();
    navigateTo('pos');
    showToast(`Loaded ${quote.quotationNo}. Checkout to Convert to Invoice.`);
}

async function deleteQuotation(id) {
    if (confirm("Delete this quotation?")) {
        await DB.deleteQuotation(id);
        await refreshAppState(); // Refresh lists
        // Note: RefreshAppState calls renderQuotations if on that view
        channel.postMessage('refresh');
        showToast("Quotation deleted");
    }
}

// --- Checkout Flow ---

// 1. Open Checkout Modal
function openCheckoutModal() {
    if (State.cart.length === 0) {
        showToast("Cart is empty!", "error");
        return;
    }

    // Reset Modal Inputs
    document.getElementById('chk-delivery').value = 0;
    document.getElementById('chk-discount-value').value = 0;
    document.getElementById('chk-discount-type').value = 'fixed';
    document.getElementById('chk-cust-name').value = '';
    document.getElementById('chk-cust-address').value = '';
    document.getElementById('chk-date').value = new Date().toISOString().split('T')[0]; // Default Today
    document.getElementById('chk-custom-inv').value = '';

    // If editing a sale, pre-fill
    if (State.editingSale) {
        // ... (Optional: pre-fill logic for edit mode if needed, for complexity let's keep simple first or ask user)
        // Let's at least keep customer name if editing
        document.getElementById('chk-cust-name').value = State.editingSale.customerName || '';
        document.getElementById('chk-cust-address').value = State.editingSale.customerAddress || '';
        document.getElementById('chk-delivery').value = State.editingSale.deliveryCharge || 0;
        // Discount logic is complex to reverse engineer exactly if percent, but we stored type/value
        document.getElementById('chk-discount-type').value = State.editingSale.discountType || 'fixed';
        document.getElementById('chk-discount-value').value = State.editingSale.discountValue || 0;

        if (State.editingSale.date) {
            document.getElementById('chk-date').value = State.editingSale.date.split('T')[0];
        }
    }

    calculateCheckoutTotal();
    openModal('modal-checkout');
}

// 2. Calculate Totals in Modal
function calculateCheckoutTotal() {
    let subtotal = 0;
    State.cart.forEach(item => {
        const price = State.priceType === 'wholesale' ? item.wholesalePrice : item.retailPrice;
        subtotal += price * item.qty;
    });

    const delivery = parseFloat(document.getElementById('chk-delivery').value) || 0;
    const discType = document.getElementById('chk-discount-type').value;
    const discVal = parseFloat(document.getElementById('chk-discount-value').value) || 0;

    let discountAmount = 0;
    if (discType === 'percent') {
        discountAmount = subtotal * (discVal / 100);
    } else {
        discountAmount = discVal;
    }

    const total = Math.max(0, subtotal + delivery - discountAmount);

    document.getElementById('chk-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('chk-total').textContent = formatCurrency(total);
}

// 3. Confirm & Save Sale
async function confirmCheckout(isQuotation = false) {
    try {
        // Recalculate everything for safety
        let totalItems = 0;
        let totalAmount = 0;
        let totalProfit = 0;

        const itemsToSave = State.cart.map(item => {
            const price = State.priceType === 'wholesale' ? item.wholesalePrice : item.retailPrice;
            const lineTotal = price * item.qty;
            const lineProfit = (price - (item.costPrice || 0)) * item.qty;

            totalAmount += lineTotal;
            totalProfit += lineProfit;
            totalItems += item.qty;

            return {
                productId: item.productId,
                name: item.name,
                qty: item.qty,
                unitPrice: price,
                price: price,
                total: lineTotal
            };
        });

        // Inputs from Modal
        const deliveryCharge = parseFloat(document.getElementById('chk-delivery').value) || 0;
        const discType = document.getElementById('chk-discount-type').value;
        const discVal = parseFloat(document.getElementById('chk-discount-value').value) || 0;

        let discountAmount = 0;
        if (discType === 'percent') {
            discountAmount = totalAmount * (discVal / 100);
        } else {
            discountAmount = discVal;
        }

        const customerName = document.getElementById('chk-cust-name').value.trim();
        const customerAddress = document.getElementById('chk-cust-address').value.trim();
        const dateInput = document.getElementById('chk-date').value;
        const customInvInput = document.getElementById('chk-custom-inv').value.trim();

        // Date Logic
        let finalDate = new Date();
        if (dateInput) {
            finalDate = new Date(dateInput);
            const now = new Date();
            finalDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
        }

        const finalTotal = Math.max(0, totalAmount + deliveryCharge - discountAmount);
        const finalProfit = totalProfit - discountAmount;

        // Is Quotation?
        if (isQuotation) {
            if (State.cart.length === 0) {
                showToast("Cart is empty!", "error");
                return;
            }

            // Delete old quotation if editing
            if (State.editingQuotation) {
                await DB.deleteQuotation(State.editingQuotation.id);
            }

            const quoteData = {
                date: finalDate.toISOString(),
                customerName: customerName || 'Walk-in Customer',
                customerAddress,
                items: itemsToSave,
                totalAmount: finalTotal,
                deliveryCharge,
                discountType: discType,
                discountValue: discVal,
                discountAmount,
                priceType: State.priceType
            };

            await DB.quotations.add(quoteData);

            showToast("Quotation Saved Successfully!");
            closeModal('modal-checkout');
            State.cart = [];
            State.editingSale = null;
            State.editingQuotation = null;
            await refreshAppState();
            channel.postMessage('refresh');
            return;
        }

        // --- SALE LOGIC ---

        // Invoice No Logic
        let invoiceNo;
        if (State.editingSale) {
            invoiceNo = State.editingSale.invoiceNo;
            await DB.deleteSale(State.editingSale.id); // Delete old, restore stock
        } else {
            if (customInvInput && customInvInput.length > 0) {
                const year = finalDate.getFullYear();
                const last4 = customInvInput.padStart(4, '0');
                invoiceNo = `INV-${year}-${last4}`;
            } else {
                invoiceNo = await DB.getNextInvoiceNo();
            }
        }

        const saleData = {
            invoiceNo,
            date: finalDate.toISOString(),
            customerType: State.priceType,
            customerName,
            customerAddress,
            items: itemsToSave,
            totalAmount: finalTotal,
            profit: finalProfit,
            deliveryCharge,
            discountType: discType,
            discountValue: discVal,
            discountAmount
        };

        // Save
        await DB.saveSale(saleData);

        // Print & Cleanup
        closeModal('modal-checkout');
        printInvoice(saleData);

        State.cart = [];
        State.editingSale = null;
        State.editingQuotation = null;

        await refreshAppState();
        channel.postMessage('refresh');
        showToast("Sale completed successfully!");

    } catch (err) {
        console.error(err);
        showToast("Error processing sale: " + err.message, "error");
    }
}

function printInvoice(sale) {
    document.getElementById('print-invoice-no').textContent = sale.invoiceNo;
    document.getElementById('print-date').textContent = new Date(sale.date).toLocaleString('en-LK');
    document.getElementById('print-type').textContent = sale.customerType.toUpperCase();

    // Print Customer Details
    document.getElementById('print-customer-name').textContent = sale.customerName || '-';
    document.getElementById('print-customer-address').textContent = sale.customerAddress || '-';

    const tbody = document.getElementById('print-items');
    tbody.innerHTML = sale.items.map(item => `
        <tr>
            <td class="pb-1">${item.name}</td>
            <td class="text-center pb-1">${item.qty}</td>
            <td class="text-right pb-1">${formatNumber(item.unitPrice)}</td>
            <td class="text-right pb-1">${formatNumber(item.total)}</td>
        </tr>
    `).join('');

    document.getElementById('print-total').textContent = formatCurrency(sale.totalAmount);

    // Reconstruct subtotal from items
    const itemsTotal = sale.items.reduce((sum, item) => sum + item.total, 0);
    document.getElementById('print-subtotal').textContent = formatCurrency(itemsTotal);

    // Discount
    if (sale.discountAmount > 0) {
        document.getElementById('print-discount-row').classList.remove('hidden');
        let discText = `-${formatNumber(sale.discountAmount)}`;
        if (sale.discountType === 'percent') {
            discText += ` (${sale.discountValue}%)`;
        }
        document.getElementById('print-discount').textContent = discText;
    } else {
        document.getElementById('print-discount-row').classList.add('hidden');
    }

    document.getElementById('print-delivery').textContent = formatCurrency(sale.deliveryCharge || 0);

    window.print();
}

// --- Sales History ---
function renderSalesHistory() {
    const tbody = document.getElementById('sales-list');
    const searchTerm = document.getElementById('sales-search').value.toLowerCase();

    const filtered = State.sales.filter(s => s.invoiceNo.toLowerCase().includes(searchTerm));

    tbody.innerHTML = filtered.map(s => `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-50">
            <td class="px-6 py-4 font-mono text-slate-500">${s.invoiceNo}</td>
            <td class="px-6 py-4">${new Date(s.date).toLocaleString()}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${s.customerType === 'wholesale' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">
                    ${s.customerType.toUpperCase()}
                </span>
            </td>
            <td class="px-6 py-4 text-right font-medium">${formatCurrency(s.totalAmount)}</td>
            <td class="px-6 py-4 text-right font-medium text-green-600">+${formatCurrency(s.profit || 0)}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="editSale('${s.invoiceNo}')" class="text-blue-500 hover:text-blue-700 mr-2" title="Edit Sale">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button onclick="reprintInvoice('${s.invoiceNo}')" class="text-slate-500 hover:text-accent transition-colors mr-2" title="Reprint">
                    <i data-lucide="printer" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteSale(${s.id})" class="text-red-400 hover:text-red-600 transition-colors" title="Delete Sale">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();
}

document.getElementById('sales-search').addEventListener('input', renderSalesHistory);

function editSale(invoiceNo) {
    const sale = State.sales.find(s => s.invoiceNo === invoiceNo);
    if (!sale) return;

    if (!confirm(`Edit Invoice ${invoiceNo}? \nCurrent cart will be cleared. \n\nNOTE: Stock will be temporarily restored.`)) return;

    // 1. Clear current cart
    State.cart = [];

    // 2. Set Editing Mode
    State.editingSale = sale;
    State.editingQuotation = null; // Clear quote edit mode if present

    // 3. Restore Cart items logic
    // We need to look up current cost prices or use old ones? 
    // Ideally use current cost prices if products still exist, else use old ones.
    // Simplifying to: find product in DB to get current Cost/Retail/Wholesale info

    sale.items.forEach(item => {
        const product = State.products.find(p => p.id === item.productId);
        // If product deleted, we might have issues. For now assume exists.
        if (product) {
            State.cart.push({
                productId: product.id,
                name: product.name,
                qty: item.qty,
                costPrice: product.costPrice,
                retailPrice: product.retailPrice,
                wholesalePrice: product.wholesalePrice
            });
        }
    });

    // 4. Set Settings
    setPriceType(sale.customerType); // This also rerenders Cart

    // 5. Set Delivery
    const delInput = document.getElementById('cart-delivery');
    if (delInput) {
        delInput.value = sale.deliveryCharge || 0;
    }

    // 6. Set Customer Details
    const custNameInput = document.getElementById('cart-cust-name');
    const custAddrInput = document.getElementById('cart-cust-address');
    if (custNameInput) custNameInput.value = sale.customerName || '';
    if (custAddrInput) custAddrInput.value = sale.customerAddress || '';

    // 7. Set Discount
    const discTypeSelect = document.getElementById('cart-discount-type');
    const discInput = document.getElementById('cart-discount-value');

    if (discTypeSelect) discTypeSelect.value = sale.discountType || 'fixed';
    if (discInput) discInput.value = sale.discountValue || 0;

    // 8. Recalculate Totals
    calculateCartTotal();

    // 9. Navigate
    navigateTo('pos');
    showToast(`Editing ${invoiceNo}. Update cart and Checkout to save.`);

    // 10. Update UI to show Editing State
    // (Optional: Change Checkout Button text)
}

function reprintInvoice(invoiceNo) {
    const sale = State.sales.find(s => s.invoiceNo === invoiceNo);
    if (sale) printInvoice(sale);
}

// --- Vendor Management ---
async function renderVendors() {
    const list = document.getElementById('vendor-list');
    State.vendors = await DB.getVendors();

    if (State.vendors.length === 0) {
        list.innerHTML = `<p class="col-span-3 text-center text-gray-400 py-10">No vendors added yet.</p>`;
        return;
    }

    list.innerHTML = State.vendors.map(v => `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-start">
            <div>
                <h4 class="font-bold text-slate-800 text-lg">${v.name}</h4>
                <p class="text-slate-500 text-sm mt-1">${v.contact || 'No contact info'}</p>
            </div>
            <div class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600">
                <i data-lucide="truck" class="w-5 h-5"></i>
            </div>
        </div>
     `).join('');
    lucide.createIcons();
}

async function handleVendorSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('vendor-name').value;
    const contact = document.getElementById('vendor-contact').value;

    await DB.addVendor({ name, contact });
    closeModal('modal-add-vendor');
    document.getElementById('form-add-vendor').reset();
    showToast("Vendor added successfully");

    // Refresh lists
    await refreshAppState();
    channel.postMessage('refresh');
    populateVendorSelect();
}

async function populateVendorSelect() {
    const vendors = await DB.getVendors();
    const select = document.getElementById('prod-vendor');
    // Keep first option (General)
    const options = vendors.map(v => `<option value="${v.name}">${v.name}</option>`).join('');
    select.innerHTML = `<option value="General">General</option>` + options;
}

// --- Utility Functions ---
function updateClock() {
    const now = new Date();
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('current-time').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(amount) {
    return 'Rs. ' + new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatNumber(amount) {
    return new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');

    if (type === 'error') {
        toast.querySelector('i').setAttribute('data-lucide', 'alert-circle');
        toast.classList.replace('bg-slate-900', 'bg-red-600');
    } else {
        toast.querySelector('i').setAttribute('data-lucide', 'check-circle');
        toast.classList.replace('bg-red-600', 'bg-slate-900');
    }

    msgEl.textContent = msg;
    lucide.createIcons();

    toast.classList.remove('translate-y-24');
    setTimeout(() => {
        toast.classList.add('translate-y-24');
    }, 3000);
}

// Data Management
async function exportData() {
    const json = await DB.exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `mirage_pos_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Backup downloaded successfully");
}

async function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            await DB.importData(e.target.result);
            input.value = ''; // Clear input to allow re-importing same file
            showToast("Data restored successfully! Reloading...", "success");
            setTimeout(() => window.location.reload(), 2000);
        } catch (err) {
            showToast("Error importing data", "error");
        }
    };
    reader.readAsText(file);
}

// --- Bulk Shipment / Import Logic ---

function openShipmentModal() {
    document.getElementById('ship-cost').value = 0;
    document.getElementById('ship-rate').value = 1;
    document.getElementById('shipment-items').innerHTML = '';
    // Add 3 rows by default
    addShipmentRow();
    addShipmentRow();
    addShipmentRow();

    updateShipmentCalculations();
    openModal('modal-add-shipment');
}

function addShipmentRow() {
    const tbody = document.getElementById('shipment-items');
    const rowId = 'row-' + Date.now() + Math.random().toString(36).substr(2, 5);

    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.className = "hover:bg-gray-50 transition-colors";
    tr.innerHTML = `
        <td class="px-4 py-3 text-center text-gray-400 font-mono text-xs align-middle index-cell">#</td>
        <td class="px-4 py-3 align-middle">
            <input type="text" name="name" placeholder="Product Name" class="w-full px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-accent">
        </td>
        <td class="px-4 py-3 align-middle">
            <select name="category" class="w-24 px-2 py-1.5 rounded border border-gray-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent">
                <option value="Jewelry">Jewelry</option>
                <option value="Fancy">Fancy</option>
            </select>
        </td>
        <td class="px-4 py-3 align-middle">
            <input type="number" name="qty" min="1" value="1" class="w-full px-2 py-1.5 rounded border border-gray-200 text-sm text-center focus:outline-none focus:ring-1 focus:ring-accent" oninput="updateShipmentCalculations()">
        </td>
        <td class="px-4 py-3 align-middle">
            <input type="number" name="cost" min="0" step="0.01" placeholder="0.00" class="w-full px-2 py-1.5 rounded border border-gray-200 text-sm text-right focus:outline-none focus:ring-1 focus:ring-accent" oninput="updateShipmentCalculations()">
            <div class="text-[10px] text-gray-400 text-right mt-0.5 final-cost">Eff: 0.00</div>
        </td>
        <td class="px-4 py-3 align-middle">
            <input type="number" name="retail" min="0" step="0.01" placeholder="0.00" class="w-full px-2 py-1.5 rounded border border-gray-200 text-sm text-right focus:outline-none focus:ring-1 focus:ring-accent">
        </td>
        <td class="px-4 py-3 align-middle text-center">
            <button onclick="removeShipmentRow('${rowId}')" class="text-gray-300 hover:text-red-500 transition-colors p-1" title="Remove Row">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    lucide.createIcons();
    updateShipmentCalculations();
}

function removeShipmentRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
    updateShipmentCalculations();
}

function updateShipmentCalculations() {
    // 1. Get Global Values
    const totalShipping = parseFloat(document.getElementById('ship-cost').value) || 0;
    const exchangeRate = parseFloat(document.getElementById('ship-rate').value) || 1;

    // 2. Iterate Rows to count total Qty
    const rows = document.querySelectorAll('#shipment-items tr');
    let totalQty = 0;

    rows.forEach((row, index) => {
        // Update Index Number
        row.querySelector('.index-cell').textContent = index + 1;

        const qty = parseInt(row.querySelector('input[name="qty"]').value) || 0;
        totalQty += qty;
    });

    // 3. Calculate Shipping Per Unit
    // If total shipping is 0, then 0.
    // If total Qty is 0, avoid division by zero.
    let shippingPerUnit = 0;
    if (totalQty > 0 && totalShipping > 0) {
        shippingPerUnit = totalShipping / totalQty;
    }

    // 4. Update UI Display
    document.getElementById('ship-total-qty').textContent = totalQty;
    // Show shipping per unit in LKR
    document.getElementById('ship-per-unit').textContent = formatCurrency(shippingPerUnit);

    // 5. Update Effective Cost for each row
    rows.forEach(row => {
        const baseCostFound = parseFloat(row.querySelector('input[name="cost"]').value) || 0;
        // Convert base cost to LKR first (Base * Rate)
        const baseCostLKR = baseCostFound * exchangeRate;

        // Final Cost = (Base * Rate) + ShippingPerUnit
        const effectiveCost = baseCostLKR + shippingPerUnit;

        row.querySelector('.final-cost').textContent = `Eff: ${formatNumber(effectiveCost)}`;
    });
}

// Listen to Global Changes too
document.getElementById('ship-cost').addEventListener('input', updateShipmentCalculations);
document.getElementById('ship-rate').addEventListener('input', updateShipmentCalculations);

async function saveShipment() {
    const vendor = document.getElementById('ship-vendor').value;
    const totalShipping = parseFloat(document.getElementById('ship-cost').value) || 0;
    const exchangeRate = parseFloat(document.getElementById('ship-rate').value) || 1;

    // Collect Data
    const rows = document.querySelectorAll('#shipment-items tr');
    const productsToAdd = [];
    let totalQty = 0;

    // First Pass: Validation & Total Qty
    let isValid = true;
    rows.forEach(row => {
        const name = row.querySelector('input[name="name"]').value.trim();
        const qty = parseInt(row.querySelector('input[name="qty"]').value) || 1;

        if (name) totalQty += qty;
    });

    if (totalQty === 0) {
        showToast("No items to add!", "error");
        return;
    }

    const shippingPerUnit = totalShipping > 0 ? (totalShipping / totalQty) : 0;

    // Second Pass: Build Objects
    for (const row of rows) {
        const name = row.querySelector('input[name="name"]').value.trim();
        if (!name) continue; // Skip empty rows

        const category = row.querySelector('select[name="category"]').value;
        const qty = parseInt(row.querySelector('input[name="qty"]').value) || 1;
        const baseCost = parseFloat(row.querySelector('input[name="cost"]').value) || 0;
        const retailPrice = parseFloat(row.querySelector('input[name="retail"]').value) || 0;

        // Auto Calculate Wholesale as retail - 10% or manual logic?
        // Let's assume wholesale is same or un-set. For now, let's set it to Retail
        // Or calculate simplistic wholesale: Cost + (Retail - Cost) * 0.5?
        // Let's just default Wholesale to Retail for now as it wasn't in the form, 
        // to keep the form simple. User can edit later.
        const wholesalePrice = retailPrice;

        // CALCULATE FINAL COST PRICE
        const finalCostPrice = (baseCost * exchangeRate) + shippingPerUnit;

        productsToAdd.push({
            name,
            category,
            vendor,
            stock: qty,
            costPrice: parseFloat(finalCostPrice.toFixed(2)),
            retailPrice: retailPrice,
            wholesalePrice: wholesalePrice
        });
    }

    if (productsToAdd.length === 0) {
        showToast("Please fill in product details", "error");
        return;
    }

    // Prepare Shipment Record
    const shipmentId = await DB.getNextShipmentId();
    const shipmentData = {
        shipmentId,
        date: new Date().toISOString(),
        vendor,
        totalCost: totalShipping, // Only recording shipping cost as "Cost" for shipment record? Or should we sum product base costs? Usually Total Cost = Product Costs + Shipping.
        // Let's store Shipping Cost separately or Total Value?
        // For now, let's store metadata.
        shippingCost: totalShipping,
        exchangeRate,
        itemCount: totalQty,
        productCount: productsToAdd.length,
        status: 'Completed'
    };

    // Batch Add via Transaction
    try {
        await DB.saveShipment(shipmentData, productsToAdd);

        closeModal('modal-add-shipment');
        showToast(`Successfully imported shipment ${shipmentId}!`);
        await refreshAppState();
        channel.postMessage('refresh');

    } catch (e) {
        console.error(e);
        showToast("Error adding shipment: " + e.message, "error");
    }
}

function renderShipments() {
    const tbody = document.getElementById('shipments-list');
    if (!tbody) return;

    // Use quotes search or dedicated? Re-use quotes search input if available or add new one?
    // Let's assume there is a dedicated view-shipments with its own search.
    // Dynamic search logic:
    const searchInput = document.getElementById('ship-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const filtered = State.shipments.filter(s => s.shipmentId.toLowerCase().includes(searchTerm) || s.vendor.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-400">No shipments found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(s => `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-50">
            <td class="px-6 py-4 font-mono text-slate-500">${s.shipmentId}</td>
            <td class="px-6 py-4">${new Date(s.date).toLocaleDateString()}</td>
            <td class="px-6 py-4">${s.vendor}</td>
            <td class="px-6 py-4 text-center">${s.itemCount}</td>
             <td class="px-6 py-4 text-right">${formatCurrency(s.shippingCost || 0)}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Completed</span>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="deleteShipment(${s.id})" class="text-red-400 hover:text-red-600 transition-colors p-1" title="Delete Record">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

document.getElementById('ship-search')?.addEventListener('input', renderShipments);

async function deleteShipment(id) {
    if (confirm("Delete shipment record? (Products imported will remaining in inventory)")) {
        await DB.deleteShipment(id);
        await refreshAppState();
        channel.postMessage('refresh');
        showToast("Shipment record deleted");
    }
}

async function resetDatabase() {
    if (confirm("CRITICAL: This will delete ALL data. Are you sure?")) {
        // Double check
        if (confirm("Really sure? This cannot be undone.")) {
            await new Dexie("MirageDB").delete();
            window.location.reload();
        }
    }
}

// --- Reports & Analytics ---

function renderReports() {
    // 1. Profit & Loss Logic
    const sales = State.sales;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalDiscount = 0;
    let totalCOGS = 0;

    sales.forEach(s => {
        totalRevenue += s.totalAmount;
        totalProfit += s.profit;
        totalDiscount += s.discountAmount || 0;
    });

    // COGS = Revenue (Net) - Profit (Net).
    // Note: totalAmount is net after discount.
    // Profit is also net profit.
    // So COGS is strictly cost of goods sold.
    totalCOGS = totalRevenue - totalProfit;

    document.getElementById('report-revenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('report-profit').textContent = formatCurrency(totalProfit);
    document.getElementById('report-cogs').textContent = formatCurrency(totalCOGS);
    document.getElementById('report-discount').textContent = formatCurrency(totalDiscount);

    // 2. Item Movement Analysis
    const itemSales = {}; // { productId: { name, qty, revenue } }

    sales.forEach(s => {
        s.items.forEach(item => {
            if (!itemSales[item.productId]) {
                itemSales[item.productId] = {
                    name: item.name,
                    qty: 0,
                    revenue: 0
                };
            }
            itemSales[item.productId].qty += item.qty;
            itemSales[item.productId].revenue += item.total;
        });
    });

    const sortedItems = Object.values(itemSales).sort((a, b) => b.qty - a.qty);
    const fastMoving = sortedItems.slice(0, 5);

    // Render Fast Moving Items
    const fastBody = document.getElementById('report-fast-moving');
    if (fastBody) {
        if (fastMoving.length === 0) {
            fastBody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-gray-400">No sales data available</td></tr>`;
        } else {
            fastBody.innerHTML = fastMoving.map((item, i) => `
                <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td class="py-3 px-4 flex items-center gap-3">
                        <span class="w-6 h-6 rounded-full bg-green-100 text-green-700 font-bold text-xs flex items-center justify-center shadow-sm">${i + 1}</span>
                        <span class="font-medium text-slate-700 truncate w-40" title="${item.name}">${item.name}</span>
                    </td>
                    <td class="py-3 px-4 text-center font-bold text-slate-800">${item.qty}</td>
                    <td class="py-3 px-4 text-right text-slate-500 text-xs">${formatCurrency(item.revenue)}</td>
                </tr>
            `).join('');
        }
    }

    // Render Slow Moving (Dead Stock focus)
    // 1. Get ALL products.
    // 2. Map sales data (or 0 if none).
    // 3. Filter: MUST currently have stock > 0 (otherwise it's just 'sold out').
    // 4. Sort by Qty Sold Asc (0 sold first).
    const allProducts = State.products.map(p => {
        const soldData = itemSales[p.id] || { qty: 0, revenue: 0 };
        return {
            name: p.name,
            stock: p.stock,
            qtySold: soldData.qty,
            revenue: soldData.revenue
        };
    });

    const deadStock = allProducts
        .filter(p => p.stock > 0)
        .sort((a, b) => a.qtySold - b.qtySold)
        .slice(0, 5);

    const slowBody = document.getElementById('report-slow-moving');
    if (slowBody) {
        if (deadStock.length === 0) {
            slowBody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-gray-400 font-medium">✨ All stock is moving!</td></tr>`;
        } else {
            slowBody.innerHTML = deadStock.map((item, i) => `
                <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td class="py-3 px-4">
                        <div class="font-medium text-slate-700 truncate w-40" title="${item.name}">${item.name}</div>
                        <div class="text-[10px] text-red-500 font-semibold mt-0.5">In Stock: ${item.stock}</div>
                    </td>
                    <td class="py-3 px-4 text-center text-slate-500 font-medium">${item.qtySold}</td>
                    <td class="py-3 px-4 text-right text-slate-400 text-xs">Rev: ${formatCurrency(item.revenue)}</td>
                </tr>
            `).join('');
        }
    }
}

// --- Authentication & User Management ---

async function checkAuth() {
    // If login-screen doesn't exist yet (not added to HTML), we wait or init.
    // Ideally we should wait for DOMContentLoaded, which this is called on.
    const loginScreen = document.getElementById('login-screen');
    if (!loginScreen) {
        init(); // Fallback
        return;
    }

    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        State.currentUser = JSON.parse(savedUser);
        loginScreen.classList.add('hidden');
        init(); // Start App
    } else {
        loginScreen.classList.remove('hidden');
        // Do NOT call init() yet
    }
}

async function login() {
    const userIn = document.getElementById('login-username');
    const passIn = document.getElementById('login-password');
    const username = userIn.value.trim();
    const password = passIn.value.trim();

    if (!username || !password) {
        alert("Please enter username and password");
        return;
    }

    try {
        const user = await DB.loginUser(username, password);
        if (user) {
            State.currentUser = user;
            sessionStorage.setItem('currentUser', JSON.stringify(user));
            document.getElementById('login-screen').classList.add('hidden');

            // Clear Inputs
            userIn.value = '';
            passIn.value = '';

            init(); // Start App Logic Now
        } else {
            alert("Invalid credentials!");
        }
    } catch (e) {
        console.error(e);
        alert("Login Error: " + e.message);
    }
}

function logout() {
    sessionStorage.removeItem('currentUser');
    State.currentUser = null;
    window.location.reload();
}

// User Management (Settings)
async function renderUsers() {
    const tbody = document.getElementById('users-list');
    if (!tbody) return;

    // Use DB fetch logic
    const allUsers = await DB.getUsers();

    tbody.innerHTML = allUsers.map(u => `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 text-slate-700 font-medium">${u.username}</td>
            <td class="px-6 py-4 text-slate-500 text-sm capitalize">${u.role || 'user'}</td>
            <td class="px-6 py-4 text-right">
                ${u.username === 'Administrator' ? '<span class="text-xs text-gray-400 italic font-medium">System Admin</span>' : `
                <button onclick="deleteUser(${u.id})" class="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg" title="Delete User">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>`}
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

async function registerUser() {
    const username = prompt("Enter new username:");
    if (!username) return;

    // Check if exists
    const users = await DB.getUsers();
    if (users.find(u => u.username === username)) {
        alert("User already exists!");
        return;
    }

    const password = prompt("Enter password:");
    if (!password) return;

    try {
        await DB.addUser({ username, password, role: 'staff' }); // Default role staff
        showToast("User added successfully!");
        await refreshAppState();
        channel.postMessage('refresh');
        renderUsers();
    } catch (e) {
        showToast("Error adding user", "error");
    }
}

async function deleteUser(id) {
    if (confirm("Delete this user?")) {
        await DB.deleteUser(id);
        await refreshAppState();
        channel.postMessage('refresh');
        renderUsers();
        showToast("User deleted");
    }
}

// Override Init Trigger
if (document.readyState === 'loading') {
    document.removeEventListener('DOMContentLoaded', init); // Try remove if added? (Tricky in single file concat but here we are appending)
    document.addEventListener('DOMContentLoaded', checkAuth);
} else {
    // Already loaded? Check Auth immediately
    checkAuth();
}
// Note: The previous init listener at top of file might still fire if we don't remove it or catch it.
// Best way: Modify the original init listener.
