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
 * --- ADMIN LOGIN ---
 */

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <title>Login Admin PSB</title>
            <style>
                body { background: linear-gradient(135deg, #1e4d2b 0%, #2e7d32 100%); height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; font-family: sans-serif; }
                .login-card { background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); width: 100%; max-width: 400px; backdrop-filter: blur(10px); }
                .btn-login { background: #1e4d2b; color: white; border-radius: 12px; width: 100%; padding: 12px; font-weight: bold; border: none; }
                .btn-login:hover { background: #2e7d32; transform: translateY(-2px); transition: 0.3s; }
            </style>
        </head>
        <body>
            <div class="login-card text-center">
                <div class="mb-4 text-success"><i class="fas fa-user-shield fa-4x"></i></div>
                <h3 class="fw-bold mb-4">Panel Admin PSB</h3>
                <form action="/login" method="POST">
                    <input name="user" type="text" class="form-control mb-3" placeholder="Username" required>
                    <input name="pass" type="password" class="form-control mb-4" placeholder="Password" required>
                    <button type="submit" class="btn btn-login mb-3">MASUK</button>
                    <a href="/" class="d-block text-muted small text-decoration-none">Kembali ke Beranda</a>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { res.send("Gagal login. <a href='/login'>Coba lagi</a>"); }
});

/**
 * --- ADMIN DASHBOARD (SIDEBAR & TABS) ---
 */

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    
    const totalSantri = data.length;
    const santriAktif = data.filter(p => p.status === 'Aktif').length;
    const santriTidakAktif = data.filter(p => p.status === 'Tidak Aktif').length;
    const santriMTs = data.filter(p => p.jenjang === 'SMP/MTs').length;
    const santriMA = data.filter(p => p.jenjang === 'MA').length;
    
    const rows = data.map((p, index) => {
        const detailJson = JSON.stringify(p).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const berkasBtn = (file, label, color) => file ? `<a href="/uploads/${file}" target="_blank" class="btn btn-xs ${color}" style="font-size:0.6rem; padding:1px 4px;">${label}</a>` : '';
        const fotoUrl = p.berkas.foto ? `/uploads/${p.berkas.foto}` : 'https://via.placeholder.com/35x45?text=Foto';

        return `
            <tr>
                <td class="text-center small">${index + 1}</td>
                <td class="text-center"><img src="${fotoUrl}" style="width:35px; height:45px; object-fit:cover; border-radius:5px; border:1px solid #ddd;"></td>
                <td><b>${p.nama}</b><br><small class="text-muted" style="font-size:0.7rem;">${p.tanggal}</small></td>
                <td class="text-center"><span class="badge bg-light text-dark border">${p.jenjang || '-'}</span></td>
                <td>
                    <div class="d-flex flex-column gap-1">
                        <div class="d-flex gap-1 flex-wrap">
                            ${berkasBtn(p.berkas.foto, 'Foto', 'btn-primary')}
                            ${berkasBtn(p.berkas.kk, 'KK', 'btn-secondary')}
                            ${berkasBtn(p.berkas.ktp, 'KTP', 'btn-info text-white')}
                            ${berkasBtn(p.berkas.ijazah, 'Ijazah', 'btn-success')}
                        </div>
                        <select class="form-select form-select-sm" style="font-size:0.7rem; padding:0 5px; height:22px;" onchange="updateStatus(${p.id}, this.value)">
                            <option value="Aktif" ${p.status === 'Aktif' ? 'selected' : ''}>🟢 Aktif</option>
                            <option value="Tidak Aktif" ${p.status === 'Tidak Aktif' ? 'selected' : ''}>🔴 Tidak Aktif</option>
                        </select>
                    </div>
                </td>
                <td><button class="btn btn-sm btn-success w-100 fw-bold" style="font-size:0.75rem;" onclick="lihatDetail('${detailJson}')">DETAIL</button></td>
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
                .sidebar { min-width: 250px; background: #1e4d2b; min-height: 100vh; color: white; position: sticky; top: 0; }
                .sidebar .nav-link { color: rgba(255,255,255,0.7); margin: 5px 15px; border-radius: 10px; text-align: left; border: none; background: none; width: 88%; }
                .sidebar .nav-link:hover, .sidebar .nav-link.active { background: rgba(255,255,255,0.1) !important; color: white !important; }
                .main-content { width: 100%; padding: 30px; }
                .stat-card { border: none; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                .main-card { border: none; border-radius: 20px; box-shadow: 0 8px 25px rgba(0,0,0,0.05); background: white; }
                .table thead { background-color: #1e4d2b; color: white; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar shadow-lg">
                    <div class="p-4 text-center"><h4 class="fw-bold mb-0">ADMIN PSB</h4><p class="small opacity-50">Panel Manajemen</p></div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link active mb-2" data-bs-toggle="pill" data-bs-target="#v-dash"><i class="fas fa-chart-line me-2"></i> Dashboard</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-santri"><i class="fas fa-users me-2"></i> Data Santri</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-bayar"><i class="fas fa-credit-card me-2"></i> Pembayaran</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-set"><i class="fas fa-cog me-2"></i> Setting</button>
                        <hr class="mx-3">
                        <a href="/logout" class="nav-link text-danger mt-2"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>

                <div class="main-content">
                    <div class="tab-content">
                        <!-- TAB DASHBOARD -->
                        <div class="tab-pane fade show active" id="v-dash">
                            <h3 class="fw-bold text-success mb-4">Ringkasan Dashboard</h3>
                            <div class="row g-3 mb-4">
                                <div class="col-md-4"><div class="card stat-card bg-success text-white p-3"><h6>Aktif</h6><h2>${santriAktif}</h2></div></div>
                                <div class="col-md-4"><div class="card stat-card bg-danger text-white p-3"><h6>Tidak Aktif</h6><h2>${santriTidakAktif}</h2></div></div>
                                <div class="col-md-4"><div class="card stat-card bg-primary text-white p-3"><h6>Total Santri</h6><h2>${totalSantri}</h2></div></div>
                                <div class="col-md-6"><div class="card stat-card bg-info text-white p-4"><h5>MTs</h5><h1 class="fw-bold">${santriMTs}</h1></div></div>
                                <div class="col-md-6"><div class="card stat-card bg-warning text-dark p-4"><h5>MA</h5><h1 class="fw-bold">${santriMA}</h1></div></div>
                            </div>
                        </div>

                        <!-- TAB DATA SANTRI -->
                        <div class="tab-pane fade" id="v-santri">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h4 class="fw-bold text-success">Manajemen Data Santri</h4>
                                <a href="/admin/export" class="btn btn-success shadow-sm rounded-pill px-4">Export Excel</a>
                            </div>
                            <div class="card main-card p-3">
                                <div class="table-responsive">
                                    <table class="table table-hover align-middle" style="font-size:0.85rem;">
                                        <thead><tr class="text-center"><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Status</th><th>Aksi</th></tr></thead>
                                        <tbody>${rows || '<tr><td colspan="6" class="text-center py-4 text-muted">Belum ada data masuk.</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- TAB PEMBAYARAN -->
                        <div class="tab-pane fade" id="v-bayar">
                            <h4 class="fw-bold text-success mb-4">Log Pembayaran Santri</h4>
                            <div class="card main-card p-4">
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Nama Santri</th>
                                                <th>Kategori</th>
                                                <th>Nominal (Rp)</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>Contoh Santri</td>
                                                <td>Pendaftaran</td>
                                                <td>Rp 250.000</td>
                                                <td><span class="badge bg-success">Lunas</span></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- TAB SETTING -->
                        <div class="tab-pane fade" id="v-set">
                            <h4 class="fw-bold text-success mb-4">Pengaturan Sistem</h4>
                            <div class="card main-card p-4">
                                <form>
                                    <div class="mb-3">
                                        <label class="form-label">Nama Pondok</label>
                                        <input type="text" class="form-control" value="Pondok Pesantren Ihya">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Tahun Ajaran</label>
                                        <input type="text" class="form-control" value="2026/2027">
                                    </div>
                                    <button type="button" class="btn btn-success px-4">Simpan Perubahan</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Detail -->
            <div class="modal fade" id="modalDetail" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content border-0" style="border-radius: 20px;">
                        <div class="modal-header bg-success text-white" style="border-radius:20px 20px 0 0;">
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
                    }).then(res => res.json()).then(data => { if(data.success) location.reload(); });
                }
                function lihatDetail(jsonStr) {
                    const d = JSON.parse(jsonStr);
                    document.getElementById('isiModal').innerHTML = \`
                        <div class="row g-3 align-items-center mb-3">
                            <div class="col-md-3 text-center"><img src="/uploads/\${d.berkas.foto}" class="img-fluid rounded shadow" style="width:110px; border:3px solid #1e4d2b;"></div>
                            <div class="col-md-9"><h3 class="fw-bold text-success mb-0">\${d.nama}</h3><p class="text-muted">\${d.jenjang} | Mendaftar: \${d.tanggal}</p></div>
                        </div>
                        <hr>
                        <div class="row g-3 mt-2">
                            <div class="col-md-6 border-end">
                                <h6 class="text-success fw-bold border-bottom pb-2 text-uppercase">Data Pribadi</h6>
                                <p class="mb-1 small">NISN: <b>\${d.nisn || '-'}</b></p>
                                <p class="mb-1 small">NIK: <b>\${d.nik || '-'}</b></p>
                                <p class="mb-1 small">Alamat: <br><b>\${d.alamat || '-'}</b></p>
                            </div>
                            <div class="col-md-6 ps-md-4">
                                <h6 class="text-success fw-bold border-bottom pb-2 text-uppercase">Data Orang Tua</h6>
                                <p class="mb-1 small">Ayah: <b>\${d.namaAyah || '-'}</b></p>
                                <p class="mb-1 small">Ibu: <b>\${d.namaIbu || '-'}</b></p>
                                <p class="mb-1 small">WhatsApp: <b>\${d.whatsapp || '-'}</b></p>
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
    const sheet = workbook.addWorksheet('Data');
    sheet.columns = [
        { header: 'Nama', key: 'nama', width: 30 },
        { header: 'Status', key: 'status', width: 15 }
    ];
    data.forEach(p => sheet.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Data_Lengkap.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("✅ Server aktif di port: " + PORT);
});