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

// --- FUNGSI PEMBANTU ---
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { 
            fs.writeFileSync(DATA_FILE, '[]'); 
            return []; 
        }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        return content ? JSON.parse(content) : [];
    } catch (e) { 
        console.error("Error membaca data:", e);
        return []; 
    }
};

const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// --- MIDDLEWARE ---
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

// --- ROUTES ---
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
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h2 style="color:#2e7d32;">✅ Pendaftaran Berhasil!</h2>
                <p>Data tersimpan permanen di Volume server.</p>
                <a href="/" style="text-decoration:none; color:white; background:#1e4d2b; padding:10px 20px; border-radius:5px;">Kembali</a>
            </div>
        `);
    } catch (e) { 
        res.status(500).send("Gagal simpan data: " + e.message); 
    }
});

// --- ADMIN PANEL ---[cite: 7]
app.get('/login', (req, res) => {
    res.send(`
        <div style="max-width:300px; margin:100px auto; font-family:sans-serif; text-align:center;">
            <h2>Login Admin</h2>
            <form action="/login" method="POST">
                <input name="user" placeholder="Username" style="width:100%; margin-bottom:10px; padding:8px;" required><br>
                <input name="pass" type="password" placeholder="Password" style="width:100%; margin-bottom:10px; padding:8px;" required><br>
                <button type="submit" style="width:100%; padding:10px; background:#1e4d2b; color:white; border:none; border-radius:5px; cursor:pointer;">Login</button>
            </form>
        </div>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { 
        res.send("Gagal login. <a href='/login'>Coba lagi</a>"); 
    }
});

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    
    // Membuat baris tabel dari data JSON[cite: 7]
    const rows = data.map((p, index) => {
        const createBtn = (file, label, colorClass) => {
            return file ? `<a href="/uploads/${file}" target="_blank" class="btn btn-sm ${colorClass} me-1 mb-1">${label}</a>` : '';
        };

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${p.tanggal}</td>
                <td><b>${p.nama}</b></td>
                <td>${p.jenjang || '-'}</td>
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
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <title>Panel Admin PSB</title>
            <style>
                body { background-color: #f8f9fa; padding: 20px; font-family: sans-serif; }
                .main-card { border-radius: 15px; border:none; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                .table thead { background-color: #1e4d2b; color: white; }
            </style>
        </head>
        <body>
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap">
                    <h2 class="fw-bold text-success mb-2">Dashboard Admin PSB</h2>
                    <div class="mb-2">
                        <a href="/admin/export" class="btn btn-success shadow-sm">Download Excel</a>
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
        { header: 'Tanggal', key: 'tanggal', width: 20 },
        { header: 'Nama', key: 'nama', width: 25 },
        { header: 'WA', key: 'whatsapp', width: 15 },
        { header: 'Jenjang', key: 'jenjang', width: 15 },
        { header: 'NISN', key: 'nisn', width: 15 }
    ];
    data.forEach(p => sheet.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Data_Pendaftar_PSB.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/login'); 
});

// Konfigurasi Port untuk Railway[cite: 7]
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aplikasi aktif di port ${PORT}`);
});