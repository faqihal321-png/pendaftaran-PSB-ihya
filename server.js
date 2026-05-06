const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const ExcelJS = require('exceljs');

const app = express();

// --- KONFIGURASI PENYIMPANAN PERMANEN ---
const VOLUME_PATH = '/app/data_pondok';
const isProduction = process.env.RAILWAY_ENVIRONMENT_ID ? true : false;
const BASE_DIR = isProduction ? VOLUME_PATH : __dirname;

const DATA_FILE = path.join(BASE_DIR, 'database.json');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- FUNGSI PEMBANTU DATA ---
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
            status: 'Aktif',
            berkas: {
                ktp: getFileName('ktp'), ijazah: getFileName('ijazah'),
                foto: getFileName('foto'), kk: getFileName('kk')
            },
            tanggal: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        };
        data.push(baru);
        saveData(data);
        res.send('<h2>Pendaftaran Berhasil!</h2><a href="/">Kembali</a>');
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

// --- ADMIN PANEL ---
app.post('/login', (req, res) => {
    if (req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { res.send("Gagal login."); }
});

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <title>Login Admin</title>
            <style>
                body { background: linear-gradient(135deg, #1e4d2b 0%, #2e7d32 100%); height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
                .login-card { background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 25px; width: 100%; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
            </style>
        </head>
        <body>
            <div class="login-card text-center">
                <i class="fas fa-user-shield fa-4x text-success mb-3"></i>
                <h3 class="fw-bold mb-4">Admin PSB</h3>
                <form action="/login" method="POST">
                    <input name="user" class="form-control mb-3" placeholder="Username" required>
                    <input name="pass" type="password" class="form-control mb-4" placeholder="Password" required>
                    <button class="btn btn-success w-100 py-2 fw-bold">MASUK</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    
    // Perhitungan Statistik
    const totalSantri = data.length;
    const santriAktif = data.filter(p => p.status === 'Aktif').length;
    const santriTidakAktif = data.filter(p => p.status === 'Tidak Aktif').length;
    const santriMTs = data.filter(p => p.jenjang === 'SMP/MTs').length;
    const santriMA = data.filter(p => p.jenjang === 'MA').length;
    
    // Rows untuk Tabel Santri
    const rowsSantri = data.map((p, index) => {
        const detailJson = JSON.stringify(p).replace(/"/g, '&quot;');
        const fotoUrl = p.berkas.foto ? `/uploads/${p.berkas.foto}` : 'https://via.placeholder.com/35x45';
        
        return `
            <tr class="santri-row" data-name="${p.nama.toLowerCase()}">
                <td class="text-center small">${index + 1}</td>
                <td class="text-center"><img src="${fotoUrl}" style="width:35px; height:45px; object-fit:cover; border-radius:5px;"></td>
                <td><b>${p.nama}</b><br><small class="text-muted" style="font-size:0.7rem;">${p.tanggal}</small></td>
                <td class="text-center small">${p.jenjang || '-'}</td>
                <td>
                    <select class="form-select form-select-sm" onchange="updateStatus(${p.id}, this.value)">
                        <option value="Aktif" ${p.status === 'Aktif' ? 'selected' : ''}>🟢 Aktif</option>
                        <option value="Tidak Aktif" ${p.status === 'Tidak Aktif' ? 'selected' : ''}>🔴 Tidak Aktif</option>
                    </select>
                </td>
                <td><button class="btn btn-sm btn-success w-100" onclick="lihatDetail('${detailJson}')">DETAIL</button></td>
            </tr>
        `;
    }).join('');

    // Rows untuk Tabel Pembayaran
    const rowsBayar = data.map((p) => {
        const months = ['Juli', 'Agt', 'Sept', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];
        const cells = months.map(m => `<td style="min-width:110px;"><div class="input-group input-group-sm"><span class="input-group-text">Rp</span><input class="form-control" placeholder="0"></div></td>`).join('');
        return `<tr class="bayar-row" data-name="${p.nama.toLowerCase()}"><td class="sticky-col"><b>${p.nama}</b></td>${cells}</tr>`;
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
                body { background-color: #f4f7f6; font-family: sans-serif; }
                .sidebar { min-width: 250px; background: #1e4d2b; min-height: 100vh; color: white; position: sticky; top: 0; }
                .sidebar .nav-link { color: rgba(255,255,255,0.7); margin: 5px 15px; border-radius: 10px; border: none; background: none; text-align: left; width: 85%; }
                .sidebar .nav-link.active { background: rgba(255,255,255,0.15) !important; color: white; }
                .main-content { width: 100%; padding: 30px; }
                .stat-card { border: none; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); color: white; }
                .sticky-col { position: sticky; left: 0; background: white !important; z-index: 2; border-right: 2px solid #eee; }
                .search-box { border-radius: 50px; padding-left: 15px; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar">
                    <div class="p-4 text-center border-bottom border-white border-opacity-10 mb-3"><h4 class="fw-bold">ADMIN PSB</h4></div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link active mb-2" data-bs-toggle="pill" data-bs-target="#v-dash"><i class="fas fa-th-large me-2"></i> Dashboard</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-santri"><i class="fas fa-users me-2"></i> Data Santri</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-bayar"><i class="fas fa-wallet me-2"></i> Pembayaran</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-set"><i class="fas fa-cog me-2"></i> Setting</button>
                        <a href="/logout" class="nav-link text-danger mt-4"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>

                <div class="main-content">
                    <div class="tab-content">
                        <!-- DASHBOARD -->
                        <div class="tab-pane fade show active" id="v-dash">
                            <h3 class="fw-bold text-success mb-4">Dashboard</h3>
                            <div class="row g-3 mb-4">
                                <div class="col-md-4"><div class="card stat-card bg-success p-3"><h6>Aktif</h6><h2>${santriAktif}</h2></div></div>
                                <div class="col-md-4"><div class="card stat-card bg-danger p-3"><h6>Tidak Aktif</h6><h2>${santriTidakAktif}</h2></div></div>
                                <div class="col-md-4"><div class="card stat-card bg-primary p-3"><h6>Total</h6><h2>${totalSantri}</h2></div></div>
                                <div class="col-md-6"><div class="card stat-card bg-info p-4"><h5>MTs</h5><h1>${santriMTs}</h1></div></div>
                                <div class="col-md-6"><div class="card stat-card bg-warning text-dark p-4"><h5>MA</h5><h1>${santriMA}</h1></div></div>
                            </div>
                        </div>

                        <!-- DATA SANTRI -->
                        <div class="tab-pane fade" id="v-santri">
                            <div class="d-flex justify-content-between mb-3 align-items-center">
                                <h4 class="fw-bold text-success">Data Santri</h4>
                                <input class="form-control w-25 search-box" placeholder="Cari nama..." onkeyup="filterT('santri-row', this.value)">
                            </div>
                            <div class="card border-0 shadow-sm p-3 rounded-4">
                                <div class="table-responsive">
                                    <table class="table table-hover align-middle">
                                        <thead class="table-light"><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Status</th><th>Aksi</th></tr></thead>
                                        <tbody>${rowsSantri || '<tr><td colspan="6" class="text-center py-4">Kosong</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- PEMBAYARAN -->
                        <div class="tab-pane fade" id="v-bayar">
                            <div class="d-flex justify-content-between mb-3 align-items-center">
                                <h4 class="fw-bold text-success">Input Pembayaran</h4>
                                <input class="form-control w-25 search-box" placeholder="Cari santri..." onkeyup="filterT('bayar-row', this.value)">
                            </div>
                            <div class="card border-0 shadow-sm overflow-hidden rounded-4">
                                <div class="table-responsive">
                                    <table class="table table-bordered mb-0">
                                        <thead class="table-success text-center">
                                            <tr><th class="sticky-col">Nama</th><th>Juli</th><th>Agt</th><th>Sept</th><th>Okt</th><th>Nov</th><th>Des</th><th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>Mei</th><th>Jun</th></tr>
                                        </thead>
                                        <tbody>${rowsBayar || '<tr><td colspan="13" class="text-center py-4">Kosong</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="v-set"><h4>Setting Segera Hadir</h4></div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="mD" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content border-0 rounded-4 overflow-hidden"><div class="modal-body p-4" id="isiM"></div></div></div></div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                function filterT(c, q) {
                    const rows = document.getElementsByClassName(c);
                    for (let r of rows) { r.style.display = r.getAttribute('data-name').includes(q.toLowerCase()) ? '' : 'none'; }
                }
                function updateStatus(id, s) {
                    fetch('/admin/update-status', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, status: s}) })
                    .then(res => res.json()).then(d => { if(d.success) location.reload(); });
                }
                function lihatDetail(js) {
                    const d = JSON.parse(js);
                    document.getElementById('isiM').innerHTML = \`
                        <div class="d-flex align-items-center mb-4"><img src="/uploads/\${d.berkas.foto}" class="rounded shadow me-3" style="width:100px; height:130px; object-fit:cover;"><div><h3 class="fw-bold text-success mb-0">\${d.nama}</h3><p class="text-muted">\${d.jenjang}</p></div></div>
                        <div class="row"><div class="col-md-6 border-end"><h6>DATA PRIBADI</h6><p class="small">NIK: \${d.nik}<br>Alamat: \${d.alamat}</p></div><div class="col-md-6 ps-4"><h6>ORANG TUA</h6><p class="small">Ayah: \${d.namaAyah}<br>WA: \${d.whatsapp}</p></div></div>
                    \`;
                    new bootstrap.Modal(document.getElementById('mD')).show();
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log("Server aktif di port: " + PORT); });