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
    
    // Membuat baris tabel dari data JSON
   const rows = data.map((p, index) => {
    // Fungsi pembantu untuk membuat tombol jika file ada
    const createBtn = (file, label, colorClass) => {
        return file ? `<a href="/uploads/${file}" target="_blank" class="btn btn-sm ${colorClass} me-1">${label}</a>` : '';
    };

    return `
        <tr>
            <td>${index + 1}</td>
            <td>${p.tanggal}</td>
            <td><b>${p.nama}</b></td>
            <td>${p.jenjang}</td>
            <td><a href="https://wa.me/${p.whatsapp}" target="_blank" class="text-decoration-none">${p.whatsapp}</a></td>
            <td>
                <div class="d-flex flex-wrap">
                    ${createBtn(p.berkas.foto, 'Foto', 'btn-primary')}
                    ${createBtn(p.berkas.kk, 'KK', 'btn-outline-secondary')}
                    ${createBtn(p.berkas.ktp, 'KTP', 'btn-outline-info')}
                    ${createBtn(p.berkas.ijazah, 'Ijazah', 'btn-outline-success')}
                </div>
            </td>
        </tr>
    `;
}).join('');[cite: 7]

    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <title>Panel Admin PSB</title>
            <style>
                body { background-color: #f8f9fa; padding: 30px; }
                .main-card { border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                .table thead { background-color: #1e4d2b; color: white; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2 class="fw-bold text-success">Dashboard Admin PSB</h2>
                    <div>
                        <a href="/admin/export" class="btn btn-success shadow-sm">
                            <i class="fas fa-file-excel"></i> Download Excel
                        </a>
                        <a href="/logout" class="btn btn-danger shadow-sm ms-2">Logout</a>
                    </div>
                </div>
                
                <div class="card main-card p-4">
                    <p class="text-muted">Total Pendaftar: <span class="badge bg-primary">${data.length}</span></p>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>Tanggal</th>
                                    <th>Nama Santri</th>
                                    <th>Jenjang</th>
                                    <th>WhatsApp</th>
                                    <th>Berkas</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows || '<tr><td colspan="6" class="text-center">Belum ada data pendaftar.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </body>
        </html>
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

// ... (Pastikan bagian rute /logout sudah ditutup)
app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/login'); 
});

// Konfigurasi Port untuk Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Aplikasi aktif di port ${PORT}`);
});