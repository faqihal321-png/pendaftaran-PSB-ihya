const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const ExcelJS = require('exceljs');

const app = express();

// --- KONFIGURASI PATH PERMANEN (RAILWAY VOLUME) ---[cite: 7, 9]
const VOLUME_PATH = '/app/data_pondok';
// Cek apakah jalan di Railway atau Laptop
const isProduction = process.env.RAILWAY_ENVIRONMENT_ID ? true : false;
const BASE_DIR = isProduction ? VOLUME_PATH : __dirname;

const DATA_FILE = path.join(BASE_DIR, 'database.json');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

// Buat folder secara otomatis jika belum ada[cite: 5, 7]
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- FUNGSI PEMBANTU ---[cite: 7]
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, '[]'); return []; }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        return content ? JSON.parse(content) : [];
    } catch (e) { return []; }
};

const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// --- MIDDLEWARE ---[cite: 7]
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR)); // Folder upload dari Volume[cite: 7, 9]
app.use('/assets', express.static(path.join(__dirname, 'assets'))); // Folder aset dari GitHub[cite: 7]

app.use(session({
    secret: 'psb-pondok-2026',
    resave: false,
    saveUninitialized: true
}));

const upload = multer({ storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

// --- ROUTES ---[cite: 7, 10]
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
                ktp: getFileName('ktp'),
                ijazah: getFileName('ijazah'),
                foto: getFileName('foto'),
                kk: getFileName('kk')
            },
            tanggal: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        };

        data.push(baru);
        saveData(data);
        res.send(`<h2>✅ Pendaftaran Berhasil!</h2><p>Data tersimpan permanen di Volume.</p><a href="/">Kembali</a>`);
    } catch (e) { res.status(500).send("Gagal: " + e.message); }
});

// --- ADMIN ---[cite: 7]
app.get('/login', (req, res) => {
    res.send('<form action="/login" method="POST">User: <input name="user"><br>Pass: <input name="pass" type="password"><br><button>Login</button></form>');
});

app.post('/login', (req, res) => {
    if (req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { res.send("Gagal login."); }
});

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    res.send(`
        <h1>Dashboard Admin (Permanent Storage)</h1>
        <p>Total: ${data.length}</p>
        <a href="/admin/export">Download Excel</a> | <a href="/logout">Logout</a>
        <hr><pre>${JSON.stringify(data, null, 2)}</pre>
    `);
});

app.get('/admin/export', async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).send("Forbidden");
    const data = readData();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pendaftar');
    sheet.columns = [
        { header: 'Nama', key: 'nama', width: 20 },
        { header: 'WA', key: 'whatsapp', width: 15 },
        { header: 'Tanggal', key: 'tanggal', width: 20 }
    ];
    data.forEach(p => sheet.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=pendaftar.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aplikasi aktif di port ${PORT}`));