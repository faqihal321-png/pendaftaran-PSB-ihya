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
 */
const VOLUME_PATH = '/app/data_pondok';
const isProduction = process.env.RAILWAY_ENVIRONMENT_ID ? true : false;
const BASE_DIR = isProduction ? VOLUME_PATH : __dirname;

const DATA_FILE = path.join(BASE_DIR, 'database.json');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * --- FUNGSI PEMBANTU DATA ---
 */
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, '[]'); return []; }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        return content ? JSON.parse(content) : [];
    } catch (e) { return []; }
};
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

/**
 * --- MIDDLEWARE ---
 */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use(session({
    secret: 'psb-pondok-2026',
    resave: false,
    saveUninitialized: true
}));

const upload = multer({ storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

/**
 * --- ROUTES APLIKASI ---
 */

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
            tanggal: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        };
        data.push(baru);
        saveData(data);
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:100px; color:#1e4d2b;">
                <h2>✅ Pendaftaran Berhasil!</h2>
                <p>Data santri telah disimpan secara permanen.</p>
                <a href="/" style="text-decoration:none; background:#1e4d2b; color:white; padding:10px 20px; border-radius:5px;">Kembali</a>
            </div>
        `);
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

/**
 * --- ADMIN PANEL DENGAN SIDEBAR ---
 */

app.get('/login', (req, res) => {
    res.send(`
        <div style="max-width:300px; margin:100px auto; font-family:sans-serif; text-align:center; padding:20px; border:1px solid #ddd; border-radius:15px; box-shadow:0 5px 15px rgba(0,0,0,0.05);">
            <h2 style="color:#1e4d2b;">Login Admin</h2>
            <form action="/login" method="POST">
                <input name="user" placeholder="User" style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #ccc; border-radius:5px;" required><br>
                <input name="pass" type="password" placeholder="Pass" style="width:100%; margin-bottom:15px; padding:8px; border:1px solid #ccc; border-radius:5px;" required><br>
                <button type="submit" style="width:100%; padding:10px; background:#1e4d2b; color:white; border:none; border-radius:5px; cursor:pointer;">MASUK</button>
            </form>
        </div>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { res.send("Gagal login. <a href='/login'>Coba lagi</a>"); }
});

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    
    const rows = data.map((p, index) => {
        const detailJson = JSON.stringify(p).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const berkasBtn = (file, label, color) => file ? `<a href="/uploads/${file}" target="_blank" class="btn btn-xs ${color}" style="font-size:0.65rem; padding:2px 5px;">${label}</a>` : '';

        return `
            <tr>
                <td class="text-center small">${index + 1}</td>
                <td style="font-size:0.75rem;">${p.tanggal}</td>
                <td><b>${p.nama}</b></td>
                <td><span class="badge bg-light text-dark border">${p.jenjang || '-'}</span></td>
                <td>
                    <div class="d-flex gap-1 flex-wrap">
                        ${berkasBtn(p.berkas.foto, 'Foto', 'btn-primary')}
                        ${berkasBtn(p.berkas.kk, 'KK', 'btn-secondary')}
                        ${berkasBtn(p.berkas.ktp, 'KTP', 'btn-info text-white')}
                        ${berkasBtn(p.berkas.ijazah, 'Ijazah', 'btn-success')}
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-success w-100 fw-bold" onclick="lihatDetail('${detailJson}')">DETAIL</button>
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
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <title>Panel Admin PSB</title>
            <style>
                body { background-color: #f4f7f6; font-family: sans-serif; overflow-x: hidden; }
                .sidebar { min-width: 250px; max-width: 250px; min-height: 100vh; background: #1e4d2b; color: white; transition: all 0.3s; }
                .sidebar .nav-link { color: rgba(255,255,255,0.7); border-radius: 10px; margin: 5px 15px; }
                .sidebar .nav-link:hover, .sidebar .nav-link.active { background: rgba(255,255,255,0.1); color: white; }
                .sidebar .nav-link i { width: 25px; }
                .main-content { width: 100%; padding: 25px; }
                .main-card { border-radius: 20px; border:none; box-shadow: 0 10px 30px rgba(0,0,0,0.05); background: white; }
                .table thead { background-color: #1e4d2b; color: white; }
                .nav-pills .nav-link.active { background-color: rgba(255,255,255,0.2) !important; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <!-- SIDEBAR -->
                <nav class="sidebar shadow-lg">
                    <div class="p-4 text-center">
                        <h4 class="fw-bold mb-0">ADMIN PSB</h4>
                        <p class="small opacity-50">Panel Manajemen</p>
                    </div>
                    <div class="nav flex-column nav-pills" id="v-pills-tab" role="tablist" aria-orientation="vertical">
                        <button class="nav-link text-start border-0 mb-2" id="v-pills-dash-tab" data-bs-toggle="pill" data-bs-target="#v-pills-dash" type="button" role="tab"><i class="fas fa-home me-2"></i> Dashboard</button>
                        <button class="nav-link active text-start border-0 mb-2" id="v-pills-santri-tab" data-bs-toggle="pill" data-bs-target="#v-pills-santri" type="button" role="tab"><i class="fas fa-user-graduate me-2"></i> Data Santri</button>
                        <hr class="mx-3">
                        <a href="/logout" class="nav-link text-start text-danger"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>

                <!-- MAIN CONTENT -->
                <div class="main-content">
                    <div class="tab-content" id="v-pills-tabContent">
                        
                        <!-- TAB DASHBOARD (KOSONG) -->
                        <div class="tab-pane fade" id="v-pills-dash" role="tabpanel">
                            <h2 class="fw-bold text-success">Dashboard</h2>
                            <p class="text-muted">Selamat datang di panel administrasi.</p>
                            <div class="main-card p-5 text-center mt-4">
                                <i class="fas fa-chart-line fa-4x text-light mb-3"></i>
                                <h4 class="text-muted">Statistik akan muncul di sini</h4>
                            </div>
                        </div>

                        <!-- TAB DATA SANTRI (TABEL) -->
                        <div class="tab-pane fade show active" id="v-pills-santri" role="tabpanel">
                            <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap">
                                <div>
                                    <h2 class="fw-bold text-success mb-0">Data Pendaftar</h2>
                                    <p class="text-muted small mb-0">Manajemen santri baru 2026/2027</p>
                                </div>
                                <div class="d-flex gap-2">
                                    <div class="p-2 px-3 bg-white border rounded-pill fw-bold text-success shadow-sm">TOTAL: ${data.length}</div>
                                    <a href="/admin/export" class="btn btn-success rounded-pill shadow-sm"><i class="fas fa-file-excel me-1"></i> EXCEL</a>
                                </div>
                            </div>
                            
                            <div class="card main-card p-4">
                                <div class="table-responsive">
                                    <table class="table table-hover align-middle">
                                        <thead>
                                            <tr class="text-center">
                                                <th>No</th><th>Waktu</th><th>Nama Lengkap</th><th>Jenjang</th><th>Berkas</th><th>Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${rows || '<tr><td colspan="6" class="text-center py-4 text-muted">Belum ada data masuk.</td></tr>'}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <!-- Modal Detail -->
            <div class="modal fade" id="modalDetail" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content border-0" style="border-radius: 20px;">
                        <div class="modal-header bg-success text-white" style="border-radius: 20px 20px 0 0;">
                            <h5 class="modal-title fw-bold">Detail Data Santri</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4" id="isiModal"></div>
                    </div>
                </div>
            </div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                function lihatDetail(jsonStr) {
                    const d = JSON.parse(jsonStr);
                    document.getElementById('isiModal').innerHTML = \`
                        <div class="row g-3">
                            <div class="col-md-6 border-end">
                                <h6 class="text-success fw-bold border-bottom pb-2">DATA PRIBADI</h6>
                                <p class="mb-1 small text-muted">Nama:</p><p class="fw-bold">\${d.nama}</p>
                                <p class="mb-1 small text-muted">NISN / NIK:</p><p class="fw-bold">\${d.nisn || '-'} / \${d.nik || '-'}</p>
                                <p class="mb-1 small text-muted">Alamat:</p><p class="fw-bold small">\${d.alamat || '-'}</p>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-success fw-bold border-bottom pb-2">DATA ORANG TUA</h6>
                                <p class="mb-1 small text-muted">Ayah:</p><p class="fw-bold">\${d.namaAyah || '-'} (\${d.kerjaAyah || '-'})</p>
                                <p class="mb-1 small text-muted">Ibu:</p><p class="fw-bold">\${d.namaIbu || '-'} (\${d.kerjaIbu || '-'})</p>
                                <p class="mb-1 small text-muted">WhatsApp:</p>
                                <p><a href="https://wa.me/\${d.whatsapp}" target="_blank" class="fw-bold text-success text-decoration-none">\${d.whatsapp || '-'}</a></p>
                            </div>
                        </div>
                    \`;
                    new bootstrap.Modal(document.getElementById('modalDetail')).show();
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/admin/export', async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).send("Akses Ditolak");
    const data = readData();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pendaftar');
    sheet.columns = [
        { header: 'Tanggal', key: 'tanggal', width: 25 },
        { header: 'Nama', key: 'nama', width: 30 },
        { header: 'WA', key: 'whatsapp', width: 20 },
        { header: 'Jenjang', key: 'jenjang', width: 15 },
        { header: 'Alamat', key: 'alamat', width: 40 }
    ];
    data.forEach(p => sheet.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Data_PSB_Lengkap.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

/**
 * --- START SERVER ---
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("Server aktif di port: " + PORT);
});