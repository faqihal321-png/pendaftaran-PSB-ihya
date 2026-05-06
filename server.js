const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const ExcelJS = require('exceljs');

const app = express();

// --- KONFIGURASI RAILWAY VOLUME ---[cite: 7, 9]
const VOLUME_PATH = '/app/data_pondok';
const isProduction = process.env.RAILWAY_ENVIRONMENT_ID ? true : false;
const BASE_DIR = isProduction ? VOLUME_PATH : __dirname;

const DATA_FILE = path.join(BASE_DIR, 'database.json');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- FUNGSI PEMBANTU ---
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, '[]'); return []; }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        return content ? JSON.parse(content) : [];
    } catch (e) { return []; }
};

const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// --- MIDDLEWARE ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR));[cite: 7, 9]
app.use('/assets', express.static(path.join(__dirname, 'assets')));[cite: 7]

app.use(session({
    secret: 'psb-pondok-2026',
    resave: false,
    saveUninitialized: true
}));

const upload = multer({ storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

// --- ROUTES UTAMA ---[cite: 7, 10]
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/daftar', upload.fields([
    { name: 'ktp' }, { name: 'ijazah' }, { name: 'foto' }, { name: 'kk' }
]), (req, res) => {
    try {
        const data = readData();
        const getFileName = (n) => (req.files && req.files[n]) ? req.files[n][0].filename : null;
        const baru = {
            id: Date.now(),
            ...req.body,
            berkas: {
                ktp: getFileName('ktp'), ijazah: getFileName('ijazah'),
                foto: getFileName('foto'), kk: getFileName('kk')
            },
            tanggal: new Date().toLocaleString("id-ID")
        };
        data.push(baru);
        saveData(data);
        res.send('<h2>Pendaftaran Berhasil!</h2><a href="/">Kembali</a>');
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

// --- ADMIN LOGIN ---[cite: 7]
app.get('/login', (req, res) => {
    res.send('<form action="/login" method="POST">User: <input name="user"><br>Pass: <input name="pass" type="password"><br><button>Login</button></form>');
});

app.post('/login', (req, res) => {
    if (req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { res.send("Gagal login."); }
});

// --- ADMIN DASHBOARD (TABEL POLOS DULU UNTUK TES) ---[cite: 7]
app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    res.send('<h1>Admin Dashboard</h1><pre>' + JSON.stringify(data, null, 2) + '</pre><a href="/logout">Logout</a>');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// --- SERVER LISTEN ---[cite: 7]
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("Server aktif di port: " + PORT);
});