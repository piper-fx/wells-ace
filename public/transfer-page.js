// --- Global State ---
let currentTransferType = '';
let currentUser = null;
let userAccounts = [];

// Stored details for pending transfer
let pendingTransfer = {
    amount: 0,
    recipientDisplay: '',
    fromAccountNum: '' // Added this to track which account to debit
};

// --- Elements ---
const pageTitle = document.getElementById('pageTitle');
const optionsList = document.getElementById('transferOptions');
const formContainer = document.getElementById('transferFormContainer');
const formHeader = document.getElementById('formHeaderTitle');
const dynamicInputs = document.getElementById('dynamicInputs');
const fromAccountSelect = document.getElementById('fromAccountSelect');
const receiptContainer = document.getElementById('receiptContainer');

// --- Modal Elements ---
const securityModal = document.getElementById('securityModal');
const securityMessage = document.getElementById('securityMessage');
const authModal = document.getElementById('authModal');
const authNameDisplay = document.getElementById('authNameDisplay');
const authCodeInput = document.getElementById('authCodeInput');
const authErrorMsg = document.getElementById('authErrorMsg');

// --- Initialization ---
window.addEventListener('load', async () => {
    const userId = sessionStorage.getItem('userId');
    if (!userId) { window.location.href = 'login.html'; return; }

    try {
        const res = await fetch(`/api/user-data?userId=${userId}`);
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.user; 
            userAccounts = data.accounts;
            populateFromAccounts();
        }
    } catch (err) { console.error('Failed to load user data'); }
});

function populateFromAccounts() {
    fromAccountSelect.innerHTML = '';
    if (userAccounts.length === 0) {
        const option = document.createElement('option');
        option.text = "No accounts available";
        fromAccountSelect.add(option);
        return;
    }

    userAccounts.forEach(acc => {
        const last4 = acc.accountNumber.slice(-4);
        const bal = acc.balance.toLocaleString('en-US', {style:'currency', currency:'USD'});
        const option = document.createElement('option');
        option.value = acc.accountNumber;
        option.text = `${acc.accountName} ...${last4} (${bal})`;
        fromAccountSelect.add(option);
    });
}

function openForm(type) {
    currentTransferType = type;
    optionsList.style.display = 'none';
    formContainer.style.display = 'block';
    pageTitle.style.display = 'none';
    dynamicInputs.innerHTML = ''; 

    if (type === 'internal') {
        formHeader.textContent = 'Internal Transfer';
        dynamicInputs.innerHTML = `
            <div class="form-group"><label class="form-label">To Account</label><select class="form-select"><option>Select internal account...</option><option>Checking ...9921</option><option>Savings ...5582</option></select></div>`;
    } else if (type === 'external') {
        formHeader.textContent = 'Transfer to Other Bank';
        dynamicInputs.innerHTML = `
            <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-input" id="extBankName" placeholder="e.g. Chase"></div>
            <div class="form-group"><label class="form-label">Account Name</label><input type="text" class="form-input" id="extAccountName" placeholder="Name on account"></div>
            <div class="form-group"><label class="form-label">Routing Number</label><input type="text" class="form-input" id="extRouting" placeholder="9-digit routing"></div>
            <div class="form-group"><label class="form-label">Account Number</label><input type="text" class="form-input" id="recipientInput" placeholder="Account number"></div>`;
    } else if (type === 'zelle') {
        formHeader.textContent = 'Send with Zelle®';
        dynamicInputs.innerHTML = `
            <div class="form-group"><label class="form-label">Recipient Email or Mobile</label><input type="text" class="form-input" id="recipientInput" placeholder="email@example.com"></div>`;
    } else if (type === 'wire') {
        formHeader.textContent = 'Wire Transfer';
        dynamicInputs.innerHTML = `
            <div class="form-group"><label class="form-label">Recipient Name</label><input type="text" class="form-input" id="recipientInput" placeholder="Full legal name"></div>
            <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-input" id="wireBankName" placeholder="Destination Bank"></div>
            <div class="form-group"><label class="form-label">SWIFT / BIC Code</label><input type="text" class="form-input" id="wireSwift" placeholder="SWIFT Code"></div>
            <div class="form-group"><label class="form-label">IBAN / Account Number</label><input type="text" class="form-input" id="wireIban" placeholder="IBAN or Account #"></div>
            <div class="form-group"><label class="form-label">Recipient Address</label><input type="text" class="form-input" id="wireAddress" placeholder="Street, City, Country"></div>`;
    }
}

function closeForm() {
    formContainer.style.display = 'none';
    optionsList.style.display = 'flex';
    pageTitle.style.display = 'block';
    document.getElementById('activeTransferForm').reset();
}

function showSecurityModal(message) {
    securityMessage.textContent = message;
    securityModal.style.display = 'flex';
}
function closeSecurityModal() { securityModal.style.display = 'none'; }

function showAuthModal() {
    if (currentUser.authVerification && currentUser.authVerification.authName) {
        authNameDisplay.textContent = currentUser.authVerification.authName;
    } else {
        authNameDisplay.textContent = "Security Code";
    }
    
    authErrorMsg.style.display = 'none';
    authCodeInput.value = '';
    authModal.style.display = 'flex';
}
function closeAuthModal() { authModal.style.display = 'none'; }

function verifyAuthCode() {
    const enteredCode = authCodeInput.value.trim();
    const correctCode = currentUser.authVerification.authCode;

    if (enteredCode === correctCode) {
        closeAuthModal();
        completeTransfer(); // Valid code -> Process backend transfer
    } else {
        authErrorMsg.style.display = 'block';
    }
}

function processTransfer(event) {
    event.preventDefault(); 

    // 1. CHECK SECURITY
    if (currentUser) {
        if (currentUser.status === 'frozen') {
            showSecurityModal("Account frozen, contact live chat support for more information.");
            return;
        }
        if (currentUser.status === 'suspended') {
            showSecurityModal("Account suspended, contact live chat support for more information.");
            return;
        }
    }

    // 2. CAPTURE DATA
    let recipientDisplay = "Recipient";
    if (currentTransferType === 'internal') {
        recipientDisplay = "Internal Account";
    } else {
        const input = document.getElementById('recipientInput');
        recipientDisplay = input ? input.value : "External Account";
    }
    const amount = parseFloat(document.getElementById('amountInput').value);
    const fromAccountNum = fromAccountSelect.value;

    if (!fromAccountNum || isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount and select an account.");
        return;
    }

    pendingTransfer = { amount, recipientDisplay, fromAccountNum };

    // 3. CHECK AUTH or PROCEED
    if (currentUser && currentUser.authVerification && currentUser.authVerification.enabled) {
        showAuthModal();
    } else {
        completeTransfer();
    }
}

// *** UPDATED: Actually calls backend API ***
async function completeTransfer() {
    const submitBtn = document.querySelector('.action-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/user-transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: sessionStorage.getItem('userId'),
                fromAccountNum: pendingTransfer.fromAccountNum,
                amount: pendingTransfer.amount,
                description: `Transfer to ${pendingTransfer.recipientDisplay}`,
                type: currentTransferType
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            formContainer.style.display = 'none';
            showReceipt(pendingTransfer.amount, pendingTransfer.recipientDisplay);
        } else {
            alert(result.message || "Transfer failed. Please try again.");
        }

    } catch (err) {
        console.error(err);
        alert("Connection error. Please check your network.");
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function showReceipt(amount, recipient) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const refNum = Math.floor(100000000 + Math.random() * 900000000);

    document.getElementById('receiptAmount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('receiptTo').textContent = recipient;
    document.getElementById('receiptDate').textContent = dateStr;
    document.getElementById('receiptRef').textContent = refNum;
    document.getElementById('receiptType').textContent = formHeader.textContent; 

    receiptContainer.style.display = 'block';
    window.scrollTo(0,0);
}

function resetPage() {
    receiptContainer.style.display = 'none';
    optionsList.style.display = 'flex';
    pageTitle.style.display = 'block';
    document.getElementById('activeTransferForm').reset();
    // Ideally reload user data here to update balance in dropdown
    location.reload(); 
}
