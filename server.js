const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const ExcelJS = require('exceljs');

const app = express();

/**
 * --- KONFIGURASI PENYIMPANAN PERMANEN (RAILWAY VOLUME) ---
 * Menggunakan folder '/app/data_pondok' di server Railway agar data tidak hilang saat update[cite: 7, 9].
 */
const VOLUME_PATH = '/app/data_pondok';
const isProduction = process.env.RAILWAY_ENVIRONMENT_ID ? true : false;
const BASE_DIR = isProduction ? VOLUME_PATH : __dirname;

const DATA_FILE = path.join(BASE_DIR, 'database.json');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

// Pastikan folder penyimpanan tersedia[cite: 5, 7]
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * --- FUNGSI PEMBANTU DATA ---
 */
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { 
            fs.writeFileSync(DATA_FILE, '[]'); 
            return []; 
        }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        return content ? JSON.parse(content) : [];
    } catch (e) { 
        console.error("Gagal membaca database:", e);
        return []; 
    }
};

const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

/**
 * --- MIDDLEWARE & CONFIG ---
 */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR)); // Akses file upload dari Volume[cite: 7, 9]
app.use('/assets', express.static(path.join(__dirname, 'assets'))); // Akses logo/poster dari Git[cite: 7]

app.use(session({
    secret: 'psb-pondok-ihyauth-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // Session aktif selama 1 jam
}));

// Konfigurasi Multer untuk Upload Berkas[cite: 7]
const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

/**
 * --- ROUTES APLIKASI ---
 */

// Halaman Formulir Pendaftaran[cite: 10]
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Proses Simpan Pendaftaran[cite: 7]
app.post('/daftar', upload.fields([
    { name: 'ktp' }, { name: 'ijazah' }, { name: 'foto' }, { name: 'kk' }
]), (req, res) => {
    try {
        const data = readData();
        const getFileName = (n) => (req.files && req.files[n]) ? req.files[n][0].filename : null;

        const baru = {
            id: Date.now(),
            ...req.body, // Mengambil semua data teks dari form (Nama, NIK, NISN, Alamat, Orang Tua)[cite: 7]
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
            <div style="text-align:center; font-family:sans-serif; margin-top:100px;">
                <h1 style="color:#2e7d32;">✅ Pendaftaran Berhasil!</h1>
                <p>Data santri telah aman tersimpan di server kami.</p>
                <br>
                <a href="/" style="padding:12px 25px; background:#1e4d2b; color:white; text-decoration:none; border-radius:8px; font-weight:bold;">KEMBALI KE BERANDA</a>
            </div>
        `);
    } catch (e) { 
        res.status(500).send("Terjadi kesalahan sistem: " + e.message); 
    }
});

/**
 * --- PANEL ADMIN ---
 */

app.get('/login', (req, res) => {
    res.send(`
        <div style="max-width:350px; margin:150px auto; font-family:sans-serif; text-align:center; padding:20px; border:1px solid #ddd; border-radius:15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
            <h2 style="color:#1e4d2b;">LOGIN ADMIN PSB</h2>
            <form action="/login" method="POST">
                <input name="user" placeholder="Username" style="width:100%; margin-bottom:12px; padding:10px; border-radius:5px; border:1px solid #ccc;" required>
                <input name="pass" type="password" placeholder="Password" style="width:100%; margin-bottom:15px; padding:10px; border-radius:5px; border:1px solid #ccc;" required>
                <button type="submit" style="width:100%; padding:12px; background:#1e4d2b; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">MASUK</button>
            </form>
        </div>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === 'admin' && pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { 
        res.send("Akses ditolak. <a href='/login'>Kembali ke Login</a>"); 
    }
});

// Halaman Dashboard Admin dengan Tabel dan Modal Detail[cite: 7]
app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    
    const rows = data.map((p, index) => {
        const createBtn = (file, label, colorClass) => {
            return file ? \`<a href="/uploads/\${file}" target="_blank" class="btn btn-sm \${colorClass} me-1 mb-1">\${label}</a>\` : '';
        };

        // Konversi objek pendaftar ke JSON string agar bisa diproses JavaScript di Modal[cite: 7]
        const safeJson = JSON.stringify(p).replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return \`
            <tr>
                <td>\${index + 1}</td>
                <td style="font-size: 0.85rem;">\${p.tanggal}</td>
                <td><b>\${p.nama}</b></td>
                <td>\${p.jenjang || '-'}</td>
                <td><span class="badge bg-light text-dark border">\${p.nisn || '-'}</span></td>
                <td>
                    <div class="d-flex flex-wrap">
                        \${createBtn(p.berkas.foto, 'Foto', 'btn-primary')}
                        \${createBtn(p.berkas.kk, 'KK', 'btn-outline-secondary')}
                        \${createBtn(p.berkas.ktp, 'KTP', 'btn-outline-info')}
                        \${createBtn(p.berkas.ijazah, 'Ijazah', 'btn-outline-success')}
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-dark w-100" onclick="showDetail('\${safeJson}')">LIHAT DETAIL</button>
                </td>
            </tr>
        \`;
    }).join('');

    res.send(\`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <title>Panel Admin PSB - Pondok Pesantren</title>
            <style>
                body { background-color: #f0f2f5; padding: 25px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                .main-card { border-radius: 18px; border:none; box-shadow: 0 10px 30px rgba(0,0,0,0.08); background: white; }
                .table thead { background-color: #1e4d2b; color: white; border-radius: 10px 10px 0 0; }
                .badge { font-weight: 500; }
            </style>
        </head>
        <body>
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap">
                    <div>
                        <h2 class="fw-bold text-success mb-0">Dashboard Admin PSB</h2>
                        <p class="text-muted small mb-0">Tahun Ajaran 2026/2027</p>
                    </div>
                    <div class="mt-2">
                        <a href="/admin/export" class="btn btn-success px-4 me-2 shadow-sm">EXCEL</a>
                        <a href="/logout" class="btn btn-outline-danger px-4 shadow-sm">LOGOUT</a>
                    </div>
                </div>
                
                <div class="card main-card p-4">
                    <div class="d-flex align-items-center mb-3">
                        <span class="badge bg-success me-2">TOTAL: \${data.length} SANTRI</span>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead class="text-center">
                                <tr>
                                    <th>No</th>
                                    <th>Tanggal Daftar</th>
                                    <th>Nama Lengkap</th>
                                    <th>Jenjang</th>
                                    <th>NISN</th>
                                    <th>Dokumen Berkas</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${rows || '<tr><td colspan="7" class="text-center py-4 text-muted">Belum ada data masuk.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Detail Pop-up -->
            <div class="modal fade" id="detailModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content" style="border-radius: 20px; overflow: hidden; border:none;">
                        <div class="modal-header bg-success text-white">
                            <h5 class="modal-title fw-bold">Detail Lengkap Data Santri</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4" id="modalBody"></div>
                    </div>
                </div>
            </div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                function showDetail(jsonString) {
                    const data = JSON.parse(jsonString);
                    const body = document.getElementById('modalBody');
                    body.innerHTML = \`
                        <div class="row g-4">
                            <div class="col-md-6 border-end">
                                <h6 class="text-success fw-bold border-bottom pb-2 mb-3">DATA PRIBADI</h6>
                                <table class="table table-borderless table-sm">
                                    <tr><td class="text-muted w-25">Nama</td><td>: <b>\${data.nama}</b></td></tr>
                                    <tr><td class="text-muted">Jenjang</td><td>: \${data.jenjang}</td></tr>
                                    <tr><td class="text-muted">NISN</td><td>: \${data.nisn}</td></tr>
                                    <tr><td class="text-muted">NIK</td><td>: \${data.nik}</td></tr>
                                    <tr><td class="text-muted">Alamat</td><td>: <span class="small">\${data.alamat}</span></td></tr>
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-success fw-bold border-bottom pb-2 mb-3">DATA ORANG TUA / WALI</h6>
                                <table class="table table-borderless table-sm">
                                    <tr><td class="text-muted w-25">Ayah</td><td>: \${data.namaAyah} (\${data.kerjaAyah})</td></tr>
                                    <tr><td class="text-muted w-25">Ibu</td><td>: \${data.namaIbu} (\${data.kerjaIbu})</td></tr>
                                    <tr><td class="text-muted w-25">WhatsApp</td><td>: <a href="https://wa.me/\${data.whatsapp}" target="_blank" class="fw-bold text-success">\${data.whatsapp}</a></td></tr>
                                </table>
                                <div class="mt-4 p-2 bg-light rounded text-center small text-muted">
                                    Mendaftar pada: \${data.tanggal}
                                </div>
                            </div>
                        </div>
                    \`;
                    new bootstrap.Modal(document.getElementById('detailModal')).show();
                }
            </script>
        </body>
        </html>
    \`);
});

// Route Export Excel Lengkap[cite: 7]
app.get('/admin/export', async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).send("Akses Ditolak");
    const data = readData();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Santri Baru');
    
    sheet.columns = [
        { header: 'Tanggal Daftar', key: 'tanggal', width: 25 },
        { header: 'Nama Lengkap', key: 'nama', width: 30 },
        { header: 'Jenjang', key: 'jenjang', width: 15 },
        { header: 'NISN', key: 'nisn', width: 15 },
        { header: 'NIK', key: 'nik', width: 20 },
        { header: 'Alamat', key: 'alamat', width: 40 },
        { header: 'Nama Ayah', key: 'namaAyah', width: 25 },
        { header: 'Nama Ibu', key: 'namaIbu', width: 25 },
        { header: 'WhatsApp', key: 'whatsapp', width: 20 }
    ];

    data.forEach(p => sheet.addRow(p));
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Data_Santri_PSB_Lengkap.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/login'); 
});

/**
 * --- START SERVER ---
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(\`✅ Server PSB berjalan pada port \${PORT}\`);
});