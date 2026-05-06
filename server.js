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
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- FUNGSI PEMBANTU ---
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, '[]'); return []; }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        let data = content ? JSON.parse(content) : [];
        // Pastikan setiap santri punya objek pembayaran
        return data.map(s => ({ ...s, pembayaran: s.pembayaran || {} }));
    } catch (e) { return []; }
};
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const readConfig = () => {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            const def = { biayaPondok: "150.000", biayaMakan: "200.000", tahunAktif: "2026" };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(def));
            return def;
        }
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) { return { biayaPondok: "0", biayaMakan: "0", tahunAktif: "2026" }; }
};
const saveConfig = (cfg) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));

// --- MIDDLEWARE ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(session({ secret: 'psb-pondok-2026', resave: false, saveUninitialized: true }));

const upload = multer({ storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/daftar', upload.fields([{ name: 'ktp' }, { name: 'ijazah' }, { name: 'foto' }, { name: 'kk' }]), (req, res) => {
    try {
        const data = readData();
        const getFileName = (n) => (req.files && req.files[n]) ? req.files[n][0].filename : null;
        const baru = {
            id: Date.now(),
            ...req.body,
            status: 'Aktif',
            pembayaran: {}, // Objek pembayaran kosong untuk santri baru
            berkas: { ktp: getFileName('ktp'), ijazah: getFileName('ijazah'), foto: getFileName('foto'), kk: getFileName('kk') },
            tanggal: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        };
        data.push(baru);
        saveData(data);
        res.send('<h2>Pendaftaran Berhasil!</h2><a href="/">Kembali</a>');
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

// --- API KONFIRMASI PEMBAYARAN (BARU) ---
app.post('/admin/bayar', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).json({ success: false });
    const { santriId, tahun, itemIds } = req.body; // itemIds format: ['p-Juli', 'm-Agt', ...]
    let data = readData();
    const idx = data.findIndex(s => s.id == santriId);
    
    if (idx !== -1) {
        if (!data[idx].pembayaran[tahun]) data[idx].pembayaran[tahun] = {};
        itemIds.forEach(id => {
            data[idx].pembayaran[tahun][id] = true; // Tandai lunas permanen
        });
        saveData(data);
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.post('/admin/update-config', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).json({ success: false });
    saveConfig(req.body);
    res.json({ success: true });
});

app.post('/login', (req, res) => {
    if (req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { res.send("Gagal login."); }
});

app.get('/login', (req, res) => {
    res.send(`<style>body{background:#1e4d2b;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;}.card{background:white;padding:30px;border-radius:15px;text-align:center;}</style>
    <div class="card"><h3>LOGIN ADMIN</h3><form action="/login" method="POST"><input name="user" class="form-control" placeholder="User" style="margin-bottom:10px;display:block;width:100%;"><input name="pass" type="password" placeholder="Pass" style="margin-bottom:15px;display:block;width:100%;"><button style="width:100%;background:#1e4d2b;color:white;border:none;padding:10px;border-radius:5px;">MASUK</button></form></div>`);
});

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    const config = readConfig();
    const tahunAktif = config.tahunAktif;
    const tahunLalu = (parseInt(tahunAktif) - 1).toString();

    const rowsSantri = data.map((p, index) => {
        const fotoUrl = p.berkas.foto ? `/uploads/${p.berkas.foto}` : 'https://via.placeholder.com/40x50';
        return `<tr class="santri-row" data-name="${p.nama.toLowerCase()}"><td>${index + 1}</td><td><img src="${fotoUrl}" style="width:40px;height:50px;object-fit:cover;border-radius:5px;"></td><td><b>${p.nama}</b></td><td>${p.jenjang}</td><td>${p.status}</td><td><button class="btn btn-sm btn-success">DETAIL</button></td></tr>`;
    }).join('');

    const cardsBayar = data.map((p) => {
        const months = ['Juli', 'Agt', 'Sept', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];
        
        // Logika Sequential: Cek apakah tahun lalu sudah lunas semua (24 checklist)
        const bayarLalu = p.pembayaran[tahunLalu] || {};
        const lunasTahunLalu = months.every(m => bayarLalu['p-'+m] && bayarLalu['m-'+m]);
        const lockClass = lunasTahunLalu ? "" : "opacity-50 pointer-events-none";

        const createCheck = (prefix) => months.map(m => {
            const isPaid = p.pembayaran[tahunAktif] && p.pembayaran[tahunAktif][prefix + '-' + m];
            return `
            <div class="col-4 col-md-3 mb-2">
                <div class="form-check p-1 border rounded ${isPaid ? 'bg-light' : 'bg-white'}">
                    <input class="form-check-input ms-1 pay-check" type="checkbox" id="${prefix}-${p.id}-${m}" 
                        data-id="${prefix}-${m}" data-price="${prefix === 'p' ? config.biayaPondok : config.biayaMakan}" 
                        ${isPaid ? 'checked disabled' : ''} onchange="hitungTotal(${p.id})">
                    <label class="form-check-label fw-bold small ${isPaid ? 'text-success' : ''}">${m}</label>
                </div>
            </div>`;
        }).join('');

        return `
            <div class="bayar-row mb-4 ${lockClass}" data-name="${p.nama.toLowerCase()}" id="card-${p.id}">
                <div class="card border-0 shadow-sm rounded-4">
                    <div class="card-header bg-success text-white py-2 d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 fw-bold">${p.nama} (${tahunAktif})</h6>
                        ${!lunasTahunLalu ? '<span class="badge bg-warning text-dark">LUNASI TUNGGAKAN '+tahunLalu+'</span>' : ''}
                    </div>
                    <div class="card-body p-3">
                        <div class="row g-2">
                            <div class="col-md-6 border-end text-center">
                                <p class="fw-bold text-success border-bottom pb-1 mb-2 small">PONDOK (Rp ${config.biayaPondok})</p>
                                <div class="row gx-1">${createCheck('p')}</div>
                            </div>
                            <div class="col-md-6 text-center">
                                <p class="fw-bold text-primary border-bottom pb-1 mb-2 small">MAKAN (Rp ${config.biayaMakan})</p>
                                <div class="row gx-1">${createCheck('m')}</div>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-light d-flex justify-content-between align-items-center py-2">
                        <h5 class="fw-bold text-success mb-0">Total: Rp <span id="total-${p.id}">0</span></h5>
                        <button class="btn btn-success fw-bold px-4 btn-bayar" id="btn-pay-${p.id}" onclick="prosesBayar(${p.id}, '${tahunAktif}')" ${!lunasTahunLalu ? 'disabled' : ''}>KONFIRMASI BAYAR</button>
                    </div>
                </div>
            </div>`;
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <title>Panel Admin</title>
            <style>
                body { background:#f4f7f6; font-family:sans-serif; }
                .sidebar { min-width:240px; background:#1e4d2b; min-height:100vh; color:white; position:sticky; top:0; }
                .sidebar .nav-link { color:rgba(255,255,255,0.7); margin:5px 15px; border-radius:10px; border:none; background:none; text-align:left; width:88%; }
                .sidebar .nav-link.active { background:rgba(255,255,255,0.15) !important; color:white; }
                .main-content { width:100%; padding:25px; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar">
                    <div class="p-4 text-center border-bottom border-white border-opacity-10 mb-3"><h4>ADMIN PSB</h4></div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link active mb-2" data-bs-toggle="pill" data-bs-target="#v-dash"><i class="fas fa-th-large me-2"></i> Dashboard</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-santri"><i class="fas fa-users me-2"></i> Data Santri</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-bayar"><i class="fas fa-check-double me-2"></i> Pembayaran</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-set"><i class="fas fa-cog me-2"></i> Setting</button>
                        <a href="/logout" class="nav-link text-danger mt-4"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>
                <div class="main-content">
                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="v-dash"><h3>Dashboard</h3><p>Tahun Aktif: ${tahunAktif}</p></div>
                        <div class="tab-pane fade" id="v-santri"><h4>Data Santri</h4><table class="table bg-white rounded shadow-sm"><tbody>${rowsSantri}</tbody></table></div>
                        <div class="tab-pane fade" id="v-bayar">
                            <div class="d-flex justify-content-between mb-3"><h4 class="text-success fw-bold">PEMBAYARAN ${tahunAktif}</h4><input class="form-control w-25" placeholder="Cari..." onkeyup="filterT(this.value)"></div>
                            <div id="payment-container">${cardsBayar}</div>
                        </div>
                        <div class="tab-pane fade" id="v-set">
                            <h4>Setting Tahun & Biaya</h4>
                            <div class="card p-4 shadow-sm border-0" style="max-width:400px;">
                                <label class="fw-bold small">Tahun Ajaran Aktif</label><input id="cfgT" class="form-control mb-2" value="${tahunAktif}">
                                <label class="fw-bold small">Biaya Pondok</label><input id="cfgP" class="form-control mb-2" value="${config.biayaPondok}">
                                <label class="fw-bold small">Biaya Makan</label><input id="cfgM" class="form-control mb-3" value="${config.biayaMakan}">
                                <button class="btn btn-success w-100 fw-bold" onclick="simpanC()">SIMPAN PERUBAHAN</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <script>
                function hitungTotal(id) {
                    const card = document.getElementById('card-' + id);
                    const checks = card.querySelectorAll('.pay-check:checked:not(:disabled)');
                    let total = 0;
                    checks.forEach(c => { total += parseInt(c.getAttribute('data-price').replace(/\\./g, '')); });
                    document.getElementById('total-' + id).innerText = total.toLocaleString('id-ID');
                }
                function prosesBayar(id, tahun) {
                    const card = document.getElementById('card-' + id);
                    const checks = card.querySelectorAll('.pay-check:checked:not(:disabled)');
                    const itemIds = Array.from(checks).map(c => c.getAttribute('data-id'));
                    if(itemIds.length === 0) return alert("Pilih bulan!");
                    if(confirm("Konfirmasi bayar Rp " + document.getElementById('total-'+id).innerText + "?")) {
                        fetch('/admin/bayar', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ santriId: id, tahun: tahun, itemIds: itemIds })
                        }).then(res => res.json()).then(d => { if(d.success) location.reload(); });
                    }
                }
                function simpanC() {
                    fetch('/admin/update-config', { method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ tahunAktif: document.getElementById('cfgT').value, biayaPondok: document.getElementById('cfgP').value, biayaMakan: document.getElementById('cfgM').value })
                    }).then(res => res.json()).then(d => { if(d.success) location.reload(); });
                }
                function filterT(q) {
                    const rows = document.getElementsByClassName('bayar-row');
                    for (let r of rows) { r.style.display = r.getAttribute('data-name').includes(q.toLowerCase()) ? '' : 'none'; }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log("Server aktif di port: " + PORT); });