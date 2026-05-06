const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const ExcelJS = require('exceljs');

const app = express();

/**
 * --- KONFIGURASI PENYIMPANAN PERMANEN ---
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
            status: 'Aktif',
            berkas: {
                ktp: getFileName('ktp'), ijazah: getFileName('ijazah'),
                foto: getFileName('foto'), kk: getFileName('kk')
            },
            tanggal: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        };
        data.push(baru);
        saveData(data);
        res.send(`<h2>✅ Pendaftaran Berhasil!</h2><a href="/">Kembali</a>`);
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

app.post('/admin/update-status', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).send("Unauthorized");
    const { id, status } = req.body;
    let data = readData();
    const index = data.findIndex(p => p.id == id);
    if (index !== -1) {
        data[index].status = status;
        saveData(data);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

/**
 * --- ADMIN PANEL ---
 */

app.get('/login', (req, res) => {
    res.send(`<form action="/login" method="POST">User: <input name="user"><br>Pass: <input name="pass" type="password"><br><button>Login</button></form>`);
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
    
    // Hitung Statistik
    const totalSantri = data.length;
    const santriAktif = data.filter(p => p.status === 'Aktif').length;
    const santriTidakAktif = data.filter(p => p.status === 'Tidak Aktif').length;
    
    const rows = data.map((p, index) => {
        const detailJson = JSON.stringify(p).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const berkasBtn = (file, label, color) => file ? `<a href="/uploads/${file}" target="_blank" class="btn btn-xs ${color}" style="font-size:0.6rem; padding:1px 4px;">${label}</a>` : '';
        const fotoUrl = p.berkas.foto ? `/uploads/${p.berkas.foto}` : 'https://via.placeholder.com/30x40?text=?';

        return `
            <tr>
                <td class="text-center fw-bold text-muted" style="width: 50px;">${index + 1}</td>
                <td class="text-center" style="width: 80px;">
                    <img src="${fotoUrl}" style="width:40px; height:50px; object-fit:cover; border-radius:6px; border:1px solid #eee;">
                </td>
                <td style="min-width: 200px;">
                    <div class="fw-bold text-dark">${p.nama}</div>
                    <div class="text-muted" style="font-size: 0.75rem;"><i class="far fa-calendar-alt me-1"></i>${p.tanggal}</div>
                </td>
                <td class="text-center" style="width: 100px;"><span class="badge bg-light text-dark border">${p.jenjang || '-'}</span></td>
                <td>
                    <div class="d-flex flex-column gap-2">
                        <div class="d-flex gap-1 flex-wrap">
                            ${berkasBtn(p.berkas.foto, 'Foto', 'btn-primary')}
                            ${berkasBtn(p.berkas.kk, 'KK', 'btn-secondary')}
                            ${berkasBtn(p.berkas.ktp, 'KTP', 'btn-info text-white')}
                            ${berkasBtn(p.berkas.ijazah, 'Ijazah', 'btn-success')}
                        </div>
                        <select class="form-select form-select-sm fw-bold" style="font-size:0.7rem; border-color: #e0e0e0;" onchange="updateStatus(${p.id}, this.value)">
                            <option value="Aktif" ${p.status === 'Aktif' ? 'selected' : ''}>🟢 Aktif</option>
                            <option value="Tidak Aktif" ${p.status === 'Tidak Aktif' ? 'selected' : ''}>🔴 Tidak Aktif</option>
                        </select>
                    </div>
                </td>
                <td class="text-center" style="width: 120px;">
                    <button class="btn btn-sm btn-success px-3 fw-bold shadow-sm" onclick="lihatDetail('${detailJson}')">DETAIL</button>
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
                body { background-color: #f8faf9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                .sidebar { min-width: 240px; background: #1e4d2b; min-height: 100vh; color: white; }
                .sidebar .nav-link { color: rgba(255,255,255,0.7); margin: 5px 15px; border-radius: 8px; }
                .sidebar .nav-link.active { background: rgba(255,255,255,0.15); color: white; }
                .main-content { width: 100%; padding: 30px; }
                .stat-card { border: none; border-radius: 15px; transition: transform 0.2s; }
                .stat-card:hover { transform: translateY(-5px); }
                .main-card { border: none; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); background: white; }
                .table thead { background: #f1f5f2; color: #1e4d2b; border-bottom: 2px solid #e8eee9; }
                .table th { font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar shadow">
                    <div class="p-4 text-center border-bottom border-white border-opacity-10 mb-3">
                        <h4 class="fw-bold mb-0">ADMIN PSB</h4>
                    </div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link text-start border-0 mb-2" data-bs-toggle="pill" data-bs-target="#v-dash"><i class="fas fa-th-large me-2"></i> Dashboard</button>
                        <button class="nav-link active text-start border-0 mb-2" data-bs-toggle="pill" data-bs-target="#v-santri"><i class="fas fa-users me-2"></i> Data Santri</button>
                        <a href="/logout" class="nav-link text-start text-danger mt-4"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>

                <div class="main-content">
                    <div class="tab-content">
                        <!-- TAB DASHBOARD DENGAN 3 KOTAK STATISTIK -->
                        <div class="tab-pane fade show active" id="v-dash">
                            <h3 class="fw-bold text-success mb-4">Ringkasan Dashboard</h3>
                            <div class="row g-4 mb-5">
                                <div class="col-md-4">
                                    <div class="card stat-card bg-success text-white p-4 shadow-sm">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div><p class="mb-1 opacity-75">Santri Aktif</p><h2 class="fw-bold mb-0">${santriAktif}</h2></div>
                                            <i class="fas fa-user-check fa-3x opacity-25"></i>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card stat-card bg-danger text-white p-4 shadow-sm">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div><p class="mb-1 opacity-75">Santri Tidak Aktif</p><h2 class="fw-bold mb-0">${santriTidakAktif}</h2></div>
                                            <i class="fas fa-user-times fa-3x opacity-25"></i>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card stat-card bg-primary text-white p-4 shadow-sm">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div><p class="mb-1 opacity-75">Total Santri</p><h2 class="fw-bold mb-0">${totalSantri}</h2></div>
                                            <i class="fas fa-users fa-3x opacity-25"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- TAB DATA SANTRI -->
                        <div class="tab-pane fade" id="v-santri">
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <h4 class="fw-bold text-success mb-0">Manajemen Data Santri</h4>
                                <a href="/admin/export" class="btn btn-success rounded-pill px-4 shadow-sm"><i class="fas fa-file-excel me-2"></i>Export Excel</a>
                            </div>
                            <div class="card main-card p-4">
                                <div class="table-responsive">
                                    <table class="table table-hover align-middle">
                                        <thead>
                                            <tr class="text-center">
                                                <th>No</th><th>Foto</th><th>Nama & Waktu</th><th>Jenjang</th><th>Berkas & Status</th><th>Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>${rows || '<tr><td colspan="6" class="text-center py-5">Belum ada data pendaftar.</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Detail Pop-up -->
            <div class="modal fade" id="modalDetail" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content border-0" style="border-radius: 20px;">
                        <div class="modal-header bg-success text-white" style="border-radius: 20px 20px 0 0;">
                            <h5 class="modal-title fw-bold">Detail Lengkap Data Santri</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4" id="isiModal"></div>
                    </div>
                </div>
            </div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                function updateStatus(id, newStatus) {
                    fetch('/admin/update-status', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({id, status: newStatus})
                    })
                    .then(res => res.json())
                    .then(data => { if(data.success) location.reload(); });
                }

                function lihatDetail(jsonStr) {
                    const d = JSON.parse(jsonStr);
                    document.getElementById('isiModal').innerHTML = \`
                        <div class="row g-4 align-items-center mb-4">
                            <div class="col-md-3 text-center">
                                <img src="/uploads/\${d.berkas.foto}" class="img-fluid rounded shadow" style="width:120px; border:3px solid #1e4d2b;">
                            </div>
                            <div class="col-md-9">
                                <h3 class="fw-bold text-success mb-0">\${d.nama}</h3>
                                <p class="text-muted">\${d.jenjang} | Mendaftar pada: \${d.tanggal}</p>
                            </div>
                        </div>
                        <hr>
                        <div class="row g-4 mt-2">
                            <div class="col-md-6">
                                <h6 class="fw-bold text-success mb-3"><i class="fas fa-info-circle me-2"></i>DATA PRIBADI</h6>
                                <table class="table table-sm table-borderless">
                                    <tr><td class="text-muted small w-25">NISN</td><td class="fw-bold">: \${d.nisn || '-'}</td></tr>
                                    <tr><td class="text-muted small">NIK</td><td class="fw-bold">: \${d.nik || '-'}</td></tr>
                                    <tr><td class="text-muted small">Alamat</td><td class="fw-bold">: \${d.alamat || '-'}</td></tr>
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6 class="fw-bold text-success mb-3"><i class="fas fa-users me-2"></i>DATA ORANG TUA</h6>
                                <table class="table table-sm table-borderless">
                                    <tr><td class="text-muted small w-25">Ayah</td><td class="fw-bold">: \${d.namaAyah} (\${d.kerjaAyah})</td></tr>
                                    <tr><td class="text-muted small">Ibu</td><td class="fw-bold">: \${d.namaIbu} (\${d.kerjaIbu})</td></tr>
                                    <tr><td class="text-muted small">WA</td><td class="fw-bold">: \${d.whatsapp}</td></tr>
                                </table>
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
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Nama', key: 'nama', width: 30 },
        { header: 'WA', key: 'whatsapp', width: 20 },
        { header: 'Jenjang', key: 'jenjang', width: 15 }
    ];
    data.forEach(p => sheet.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Data_PSB_Lengkap.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("✅ Server aktif di port: " + PORT);
});