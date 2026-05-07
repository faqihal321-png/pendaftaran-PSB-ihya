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
const ASSETS_DIR = path.join(__dirname, 'assets');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// --- FUNGSI PEMBANTU DATA & CONFIG ---
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, '[]'); return []; }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        let data = content ? JSON.parse(content) : [];
        return data.map(s => ({ ...s, pembayaran: s.pembayaran || {} }));
    } catch (e) { return []; }
};
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const readConfig = () => {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            const def = { 
                tahunAktif: "2026",
                biayaA: "100.000",   // Pendaftaran
                biayaB: "500.000",   // Seragam, Buku, Infaq
                biayaC: "50.000",    // Bulanan Pondok
                biayaD: "400.000"    // Bulanan Makan
            };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(def));
            return def;
        }
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) { return { tahunAktif: "2026", biayaA: "0", biayaB: "0", biayaC: "0", biayaD: "0" }; }
};
const saveConfig = (cfg) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));

// --- MIDDLEWARE ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/assets', express.static(ASSETS_DIR));
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
        const config = readConfig();
        const getFileName = (n) => (req.files && req.files[n]) ? req.files[n][0].filename : null;
        const opsiWaktu = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const waktuSkrg = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", ...opsiWaktu });

        const baru = {
            id: Date.now(),
            ...req.body,
            status: 'Aktif',
            tahunDaftar: config.tahunAktif,
            pembayaran: {},
            berkas: { ktp: getFileName('ktp'), ijazah: getFileName('ijazah'), foto: getFileName('foto'), kk: getFileName('kk') },
            tanggal: waktuSkrg 
        };
        data.push(baru);
        saveData(data);
        res.send('<h2>Pendaftaran Berhasil!</h2><a href="/">Kembali</a>');
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

app.post('/admin/edit-santri', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).json({ success: false });
    const { id, nama, jenjang, nisn, nik, alamat, namaAyah, whatsapp } = req.body;
    let data = readData();
    const idx = data.findIndex(s => s.id == id);
    if (idx !== -1) {
        data[idx] = { ...data[idx], nama, jenjang, nisn, nik, alamat, namaAyah, whatsapp };
        saveData(data);
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.post('/admin/hapus-santri', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).json({ success: false });
    const { id } = req.body;
    let data = readData();
    const filtered = data.filter(s => s.id != id);
    saveData(filtered);
    res.json({ success: true });
});

app.post('/admin/konfirmasi-bayar', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).json({ success: false });
    const { santriId, tahun, itemIds } = req.body;
    let data = readData();
    const idx = data.findIndex(s => s.id == santriId);
    if (idx !== -1) {
        if (!data[idx].pembayaran[tahun]) data[idx].pembayaran[tahun] = {};
        itemIds.forEach(id => { data[idx].pembayaran[tahun][id] = true; });
        saveData(data);
        return res.json({ success: true });
    }
    res.json({ success: false });
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

app.post('/admin/update-config', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).send("Unauthorized");
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
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <title>Login Admin</title>
            <style>
                body { background: linear-gradient(135deg, #1e4d2b 0%, #2e7d32 100%); height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
                .login-card { background: white; padding: 40px; border-radius: 25px; width: 100%; max-width: 380px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
                .btn-success { background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); border: none; transition: all 0.3s ease; }
                .btn-success:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(46,125,50,0.4); }
            </style>
        </head>
        <body>
            <div class="login-card text-center">
                <h3 class="fw-bold mb-4 text-success">ADMIN PSB</h3>
                <form action="/login" method="POST">
                    <input name="user" class="form-control mb-3" placeholder="Username" required>
                    <input name="pass" type="password" class="form-control mb-4" placeholder="Password" required>
                    <button class="btn btn-success w-100 py-2 fw-bold shadow-sm">MASUK</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    const config = readConfig();
    const tahunAktif = config.tahunAktif || "2026";
    const months = ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];

    const santriAktifCount = data.filter(p => p.status === 'Aktif').length;
    const santriTidakAktif = data.filter(p => p.status === 'Tidak Aktif').length;
    const santriMTs = data.filter(p => p.jenjang === 'SMP/MTs').length;
    const santriMA = data.filter(p => p.jenjang === 'SMA/MA').length;

    const rowsSantri = data.map((p, index) => {
        const fotoUrl = p.berkas.foto ? '/uploads/' + p.berkas.foto : 'https://via.placeholder.com/40x50';
        const btnB = (file, label, color) => {
            if(!file) return '<button class="btn btn-xs btn-light disabled" style="font-size:0.65rem; padding:2px 5px;">'+label+'</button>';
            return '<a href="/uploads/'+file+'" target="_blank" class="btn btn-xs '+color+' fw-bold" style="font-size:0.65rem; padding:2px 5px;">'+label+'</a>';
        };

        let labelDaftar = p.tahunDaftar || '2025';
        if (p.tanggal) {
            const tglPart = p.tanggal.split(',')[0].split('/');
            if (tglPart.length === 3) {
                const bulanIndo = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
                labelDaftar = bulanIndo[parseInt(tglPart[1])-1] + ' ' + tglPart[2];
            } else { labelDaftar = p.tanggal; }
        }

        return '<tr class="santri-row" data-name="'+p.nama.toLowerCase()+'" data-status="'+p.status+'">' +
            '<td class="text-center small">'+(index + 1)+'</td>' +
            '<td class="text-center"><img src="'+fotoUrl+'" style="width:40px; height:50px; object-fit:cover; border-radius:5px; border:1px solid #ddd;"></td>' +
            '<td><b>'+p.nama+'</b><br><small class="text-muted" style="font-size:0.7rem;">Daftar: '+labelDaftar+'</small></td>' +
            '<td class="text-center small">'+(p.jenjang || '-')+'</td>' +
            '<td><div class="d-flex flex-wrap gap-1">' +
                btnB(p.berkas.foto, 'FOTO', 'btn-primary') +
                btnB(p.berkas.ijazah, 'IJAZAH', 'btn-secondary') +
                btnB(p.berkas.kk, 'KK', 'btn-info text-white') +
                btnB(p.berkas.ktp, 'KTP', 'btn-warning') +
            '</div></td>' +
            '<td><select class="form-select form-select-sm fw-bold shadow-sm" onchange="updateStatus('+p.id+', this.value)">' +
                '<option value="Aktif" '+(p.status === 'Aktif' ? 'selected' : '')+'>🟢 Aktif</option>' +
                '<option value="Tidak Aktif" '+(p.status === 'Tidak Aktif' ? 'selected' : '')+'>🔴 Tidak Aktif</option>' +
            '</select></td>' +
            '<td><button class="btn btn-sm btn-success w-100 fw-bold shadow-sm" onclick="lihatDetail('+p.id+')">DETAIL</button></td>' +
        '</tr>';
    }).join('');

    const cardsBayar = data.map((p) => {
        const isBaru = p.tahunDaftar === tahunAktif;
        const history = p.pembayaran[tahunAktif] || {};

        const createCheck = (id, label, price) => {
            const lunas = history[id];
            return '<div class="col-6 mb-2"><div class="form-check p-1 border rounded '+(lunas ? 'bg-light border-success' : 'bg-white shadow-sm')+'">' +
                    '<input class="form-check-input ms-1 me-1 pay-check" type="checkbox" id="'+id+'-'+p.id+'" ' +
                        'data-id="'+id+'" data-price="'+price+'" data-label="'+label+'" ' +
                        (lunas ? 'checked disabled' : '')+' onchange="hitungTotal('+p.id+')">' +
                    '<label class="form-check-label fw-bold small '+(lunas ? 'text-success' : '')+'">'+label+'</label></div></div>';
        };

        return '<div class="bayar-row mb-4" data-name="'+p.nama.toLowerCase()+'" id="card-'+p.id+'" style="display: none;">' +
            '<div class="card border-0 shadow-sm rounded-4">' +
                '<div class="card-header bg-success text-white py-2 d-flex justify-content-between align-items-center">' +
                    '<h6 class="mb-0 fw-bold"><i class="fas fa-user-circle me-1"></i> '+p.nama+' ('+tahunAktif+')</h6>' +
                '</div><div class="card-body p-3">' +
                
                // POIN A & B (Hanya untuk santri baru)
                (isBaru ? 
                '<p class="fw-bold text-success border-bottom pb-1 mb-2 small text-uppercase">Poin A & B (Registrasi)</p>' +
                '<div class="row gx-1">' +
                    createCheck('poin-a', 'Uang Pendaftaran (A)', config.biayaA) +
                    createCheck('poin-b', 'Seragam, Buku, Kitab (B)', config.biayaB) +
                '</div>' : '') +

                // POIN C (Pondok)
                '<p class="fw-bold text-primary border-bottom pb-1 mt-3 mb-2 small text-uppercase">Poin C (Bulanan Pondok)</p>' +
                '<div class="row gx-1">' + months.map(m => createCheck('c-'+m, m, config.biayaC)).join('') + '</div>' +

                // POIN D (Makan)
                '<p class="fw-bold text-danger border-bottom pb-1 mt-3 mb-2 small text-uppercase">Poin D (Bulanan Makan)</p>' +
                '<div class="row gx-1">' + months.map(m => createCheck('d-'+m, m, config.biayaD)).join('') + '</div>' +

                '</div>' +
                '<div class="card-footer bg-light border-0 d-flex justify-content-between align-items-center py-3">' +
                    '<div><span class="text-muted small fw-bold text-uppercase">Total Tagihan:</span><h4 class="text-success fw-bold mb-0">Rp <span id="total-'+p.id+'">0</span></h4></div>' +
                    '<button class="btn btn-success fw-bold px-4 py-2 rounded-3 shadow-sm" onclick="prosesBayar('+p.id+')"><i class="fas fa-check-circle me-2"></i> KONFIRMASI BAYAR</button>' +
                '</div></div></div>';
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <title>Panel Admin PSB</title>
            <style>
                body { background-color: #f4f7f6; font-family: sans-serif; }
                .sidebar { min-width: 250px; background: #1e4d2b; min-height: 100vh; color: white; position: sticky; top: 0; }
                .sidebar .nav-link { color: rgba(255,255,255,0.7); margin: 5px 15px; border-radius: 12px; border:none; background:none; text-align:left; width:88%; transition: all 0.3s ease; }
                .sidebar .nav-link:hover { background: rgba(255,255,255,0.1); color: white; transform: translateX(5px); }
                .sidebar .nav-link.active { background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%) !important; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
                .main-content { width: 100%; padding: 25px; }
                .sidebar-kop { padding: 25px 15px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; text-align: center; }
                .sidebar-kop img { width: 70px; height: 70px; margin-bottom: 12px; border-radius: 50%; padding: 5px; background: white; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar shadow-lg">
                    <div class="sidebar-kop">
                        <img src="/assets/logo-pondok.png" onerror="this.src='https://via.placeholder.com/70x70?text=LOGO'">
                        <h6>PONDOK PESANTREN<br>IHYAUTH THOLIBIN</h6>
                    </div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link active mb-2" data-bs-toggle="pill" data-bs-target="#v-dash"><i class="fas fa-th-large me-2"></i> Dashboard</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-santri"><i class="fas fa-users me-2"></i> Data Santri</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-bayar"><i class="fas fa-check-double me-2"></i> Pembayaran</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-set"><i class="fas fa-cog me-2"></i> Setting</button>
                        <hr class="mx-3 opacity-25">
                        <a href="/logout" class="nav-link text-danger mt-2"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>
                <div class="main-content">
                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="v-dash"><h3>Dashboard</h3></div>
                        <div class="tab-pane fade" id="v-santri">
                            <div class="d-flex justify-content-between mb-3"><h4>Data Santri</h4><input id="cari-santri" class="form-control w-25 rounded-pill" placeholder="Cari..." onkeyup="filterS()"></div>
                            <div class="card border-0 shadow-sm p-3 rounded-4 bg-white"><table class="table"><thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Berkas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rowsSantri}</tbody></table></div>
                        </div>
                        <div class="tab-pane fade" id="v-bayar">
                            <div class="d-flex justify-content-between mb-4 align-items-center"><h4>Pembayaran</h4><input id="cari-bayar" class="form-control w-50 rounded-pill shadow-sm" placeholder="Cari santri..." onkeyup="filterT('bayar-row', this.value, true)"></div>
                            <div id="payment-container"><div id="hint-bayar" class="py-5 text-center text-muted"><h5>🔍 Cari nama santri...</h5></div>${cardsBayar}</div>
                        </div>
                        <div class="tab-pane fade" id="v-set">
                            <h4 class="fw-bold text-success mb-4 text-uppercase">Pengaturan Biaya</h4>
                            <div class="card border-0 shadow-sm p-4 rounded-4 bg-white" style="max-width: 450px;">
                                <div class="mb-2"><label class="small fw-bold">Poin A (Pendaftaran)</label><input type="text" id="cfgA" class="form-control" value="${config.biayaA}"></div>
                                <div class="mb-2"><label class="small fw-bold">Poin B (Registrasi)</label><input type="text" id="cfgB" class="form-control" value="${config.biayaB}"></div>
                                <div class="mb-2"><label class="small fw-bold">Poin C (Pondok)</label><input type="text" id="cfgC" class="form-control" value="${config.biayaC}"></div>
                                <div class="mb-3"><label class="small fw-bold">Poin D (Makan)</label><input type="text" id="cfgD" class="form-control" value="${config.biayaD}"></div>
                                <div class="mb-3"><label class="small fw-bold">Tahun Aktif</label><input type="text" id="cfgT" class="form-control" value="${tahunAktif}"></div>
                                <button class="btn btn-success fw-bold w-100" onclick="simpanC()">SIMPAN</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal fade" id="mD" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content border-0 rounded-4 overflow-hidden"><div class="modal-body p-4" id="isiM"></div></div></div></div>
            <div class="modal fade" id="mKwitansi" data-bs-backdrop="static"><div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 rounded-4 shadow-lg"><div class="modal-body p-0" id="isiKwitansi"></div></div></div></div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                const DB_SANTRI = ${JSON.stringify(data)};

                function filterS() {
                    const q = document.getElementById('cari-santri').value.toLowerCase();
                    document.querySelectorAll('.santri-row').forEach(r => r.style.display = r.dataset.name.includes(q) ? '' : 'none');
                }

                function filterT(c, q, s) {
                    const hint = document.getElementById('hint-bayar');
                    if (q === "") { if(hint) hint.style.display = ''; document.querySelectorAll('.'+c).forEach(r => r.style.display = 'none'); }
                    else { if(hint) hint.style.display = 'none'; document.querySelectorAll('.'+c).forEach(r => r.style.display = r.dataset.name.includes(q.toLowerCase()) ? '' : 'none'); }
                }

                function hitungTotal(id) {
                    const card = document.getElementById('card-' + id);
                    const checks = card.querySelectorAll('.pay-check:checked:not(:disabled)');
                    let total = 0;
                    checks.forEach(c => { total += parseInt(c.getAttribute('data-price').replace(/\\./g, '')); });
                    document.getElementById('total-' + id).innerText = total.toLocaleString('id-ID');
                }

                function tampilkanKwitansi(nama, total, rincian, wa) {
                    let tableRows = rincian.map(i => \`<tr><td class="p-2 border-bottom small">\${i.ket}</td><td class="p-2 border-bottom text-end small">Rp \${parseInt(i.hrg).toLocaleString('id-ID')}</td></tr>\`).join('');
                    let html = \`
                        <div id="pdf-area" class="p-4 bg-white">
                            <div class="text-center border-bottom pb-3 mb-3">
                                <h5 class="fw-bold mb-0">IHYAUTH THOLIBIN</h5>
                                <small>Kwitansi Pembayaran Resmi</small>
                            </div>
                            <p class="small mb-1">Nama: <b>\${nama}</b></p>
                            <table class="w-100 mb-3">\${tableRows}<tr class="fw-bold bg-light"><td class="p-2">TOTAL AKHIR</td><td class="p-2 text-end text-success">Rp \${total}</td></tr></table>
                            <div class="text-center py-1 border rounded fw-bold text-success mb-3">LUNAS</div>
                        </div>
                        <div class="p-3 bg-light d-flex flex-column gap-2 border-top">
                            <button onclick="downloadPDF('\${nama}')" class="btn btn-danger fw-bold"><i class="fas fa-file-pdf me-2"></i>PDF</button>
                            <button class="btn btn-secondary" onclick="location.reload()">TUTUP</button>
                        </div>\`;
                    document.getElementById('isiKwitansi').innerHTML = html;
                    new bootstrap.Modal(document.getElementById('mKwitansi')).show();
                }

                function downloadPDF(nama) {
                    html2pdf().set({ margin: 10, filename: 'Kwitansi_'+nama+'.pdf' }).from(document.getElementById('pdf-area')).save();
                }

                function prosesBayar(id) {
                    const s = DB_SANTRI.find(x => x.id == id);
                    const total = document.getElementById('total-' + id).innerText;
                    const checks = document.getElementById('card-'+id).querySelectorAll('.pay-check:checked:not(:disabled)');
                    if(checks.length === 0) return alert("Pilih item!");
                    
                    const itemIds = Array.from(checks).map(c => c.getAttribute('data-id'));
                    const rincian = Array.from(checks).map(c => ({ ket: c.getAttribute('data-label'), hrg: c.getAttribute('data-price').replace(/\\./g, '') }));

                    if(confirm("Konfirmasi bayar Rp " + total + "?")) {
                        fetch('/admin/konfirmasi-bayar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ santriId: id, tahun: "${tahunAktif}", itemIds: itemIds }) })
                        .then(res => res.json()).then(d => { if(d.success) tampilkanKwitansi(s.nama, total, rincian, s.whatsapp); });
                    }
                }

                function lihatDetail(id) {
                    const d = DB_SANTRI.find(x => x.id == id);
                    let html = '<div class="text-center mb-3"><img src="/uploads/'+d.berkas.foto+'" class="rounded shadow" style="width:100px; height:125px; object-fit:cover;"></div>' +
                               '<p><b>Nama:</b> '+d.nama+'<br><b>NISN:</b> '+(d.nisn||'-')+'<br><b>WhatsApp:</b> '+d.whatsapp+'</p>' +
                               '<button class="btn btn-secondary w-100" data-bs-dismiss="modal">Tutup</button>';
                    document.getElementById('isiM').innerHTML = html;
                    new bootstrap.Modal(document.getElementById('mD')).show();
                }

                function simpanC() {
                    const payload = { tahunAktif: document.getElementById('cfgT').value, biayaA: document.getElementById('cfgA').value, biayaB: document.getElementById('cfgB').value, biayaC: document.getElementById('cfgC').value, biayaD: document.getElementById('cfgD').value };
                    fetch('/admin/update-config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) }).then(res => res.json()).then(d => { if(d.success) location.reload(); });
                }
            </script>
        </body></html>`);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log("Server aktif di port: " + PORT); });