let allUsers = [];
let allAccounts = [];
let selectedUser = null;

// Initialize on Load
window.addEventListener('load', initializeAdmin);

async function initializeAdmin() {
    await loadData();
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('transDate').value = now.toISOString().slice(0,16);
}

async function loadData() {
    try {
        const res = await fetch('/api/admin/data'); 
        const data = await res.json();
        allUsers = data.users;
        allAccounts = data.accounts;
        renderUsersList(allUsers);
        updateStats();
    } catch (error) { 
        console.error('Error fetching admin data:', error);
    }
}

// --- RENDER FUNCTIONS ---
function renderUsersList(users) {
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    if (!users.length) { 
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No users found</div>'; 
        return; 
    }

    users.forEach(user => {
        const acc = allAccounts.find(a => a.userId === user.userId);
        const balance = acc ? `$${acc.balance.toLocaleString('en-US', {minimumFractionDigits: 2})}` : '$0.00';
        const acctNum = acc ? acc.accountNumber : 'N/A';

        let statusClass = 'status-successful';
        if(user.status === 'suspended') statusClass = 'status-suspended';
        if(user.status === 'frozen') statusClass = 'status-frozen';

        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <div class="user-info">
                <h4>${user.firstName} ${user.lastName}</h4>
                <p>${user.email}</p>
                <small style="color:#5c5c5c;">Acct: ${acctNum} | Bal: <b style="color:#1f1f1f;">${balance}</b></small>
                <div style="margin-top:5px;">
                    <span class="status-badge ${statusClass}">${user.status}</span>
                </div>
            </div>
            <div class="user-actions">
                <button class="btn-sm" onclick="openEditModal('${user.userId}')">Manage</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function updateStats() {
    document.getElementById('totalUsers').textContent = allUsers.length;
    document.getElementById('activeUsers').textContent = allUsers.filter(u => u.status === 'successful').length;
    document.getElementById('suspendedUsers').textContent = allUsers.filter(u => u.status !== 'successful').length;
    
    const total = allAccounts.reduce((sum, a) => sum + a.balance, 0);
    document.getElementById('totalBalance').textContent = `$${total.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
}

function searchUsers() {
    const term = document.getElementById('userSearch').value.toLowerCase();
    renderUsersList(allUsers.filter(u => 
        u.email.toLowerCase().includes(term) || 
        u.firstName.toLowerCase().includes(term)
    ));
}

// --- MODAL & USER MANAGEMENT ---
function openEditModal(userId) {
    const user = allUsers.find(u => u.userId === userId);
    if (!user) return;
    selectedUser = user;

    document.getElementById('viewName').value = `${user.firstName} ${user.lastName}`;
    document.getElementById('viewEmail').value = user.email;
    document.getElementById('viewSSN').value = user.ssn || 'N/A';
    document.getElementById('viewDL').value = user.cardNum || 'N/A';
    document.getElementById('viewDOB').value = user.dob || 'N/A';
    document.getElementById('viewUserId').value = user.userId;

    const userAccs = allAccounts.filter(a => a.userId === userId);
    let accHtml = '';
    userAccs.forEach(a => {
        accHtml += `<div class="account-preview"><b>${a.accountName}</b><br>Num: ${a.accountNumber}<br>Balance: $${a.balance.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>`;
    });
    document.getElementById('userAccountsDisplay').innerHTML = accHtml || '<p>No accounts found</p>';

    document.getElementById('editUserStatus').value = user.status;
    document.getElementById('editUserNote').value = user.adminNote || '';

    const auth = user.authVerification || {};
    document.getElementById('authToggle').checked = auth.enabled === true;
    document.getElementById('authName').value = auth.authName || '';
    document.getElementById('authCode').value = auth.authCode || '';
    
    toggleAuthFields();
    document.getElementById('editUserModal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('editUserModal').classList.remove('show');
    selectedUser = null;
}

function toggleAuthFields() {
    const checked = document.getElementById('authToggle').checked;
    document.getElementById('authFields').style.display = checked ? 'block' : 'none';
}

async function saveUserChanges() {
    if (!selectedUser) return;

    const authEnabled = document.getElementById('authToggle').checked;
    const updateData = {
        userId: selectedUser.userId,
        status: document.getElementById('editUserStatus').value,
        adminNote: document.getElementById('editUserNote').value,
        authVerification: {
            enabled: authEnabled,
            authName: document.getElementById('authName').value,
            authCode: document.getElementById('authCode').value
        }
    };

    try {
        const res = await fetch('/api/admin/update-user', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updateData)
        });
        const result = await res.json();
        if(result.success) {
            alert('Saved successfully!');
            closeEditModal();
            loadData(); 
        } else {
            alert('Error saving: ' + result.message);
        }
    } catch(err) { alert('Connection error'); }
}

// --- TRANSACTIONS ---
async function performTx(url, data, msgId) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        const msgEl = document.getElementById(msgId);
        
        if(result.success) {
            msgEl.textContent = 'Transaction Successful!';
            msgEl.className = 'message success';
            msgEl.style.display = 'block';
            loadData(); 
        } else {
            msgEl.textContent = result.message || 'Transaction Failed';
            msgEl.className = 'message error';
            msgEl.style.display = 'block';
        }
        setTimeout(() => msgEl.style.display = 'none', 4000);
    } catch(err) { alert('Error processing transaction'); }
}

function fundAccount() {
    performTx('/api/admin/transaction', {
        accountNumber: document.getElementById('fundAccountNumber').value,
        amount: document.getElementById('fundAmount').value,
        description: document.getElementById('fundDescription').value,
        type: 'credit'
    }, 'fundMsg');
}

function debitUserAccount() {
    performTx('/api/admin/transaction', {
        accountNumber: document.getElementById('debitAccountNumber').value,
        amount: document.getElementById('debitAmount').value,
        description: document.getElementById('debitNote').value,
        type: 'debit'
    }, 'debitMsg');
}

function createCustomTransaction() {
    performTx('/api/admin/transaction', {
        accountNumber: document.getElementById('transAccountNumber').value,
        amount: document.getElementById('transAmount').value,
        type: document.getElementById('transType').value,
        merchant: document.getElementById('transName').value,
        date: document.getElementById('transDate').value
    }, 'transMsg');
}

function logoutAdmin() { 
    sessionStorage.removeItem('adminLoggedIn'); // Clear Security Flag
    window.location.href = 'admin-login.html'; 
}
