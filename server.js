const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');

const app = express();

// --- KONFIGURASI PENYIMPANAN ---
const VOLUME_PATH = '/app/data_pondok';
const isProduction = process.env.RAILWAY_ENVIRONMENT_ID ? true : false;
const BASE_DIR = isProduction ? VOLUME_PATH : __dirname;

const DATA_FILE = path.join(BASE_DIR, 'database.json');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
            const def = { biayaPondok: "150.000", biayaMakan: "200.000", tahunAktif: "2026" };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(def));
            return def;
        }
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) { return { biayaPondok: "0", biayaMakan: "0", tahunAktif: "2026" }; }
};
const saveConfig = (cfg) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR));
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

// FITUR BARU: EDIT DATA
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

// FITUR BARU: HAPUS SANTRI
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
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><title>Login</title><style>body{background:linear-gradient(135deg,#1e4d2b,#2e7d32);height:100vh;display:flex;align-items:center;justify-content:center;}.card{padding:40px;border-radius:20px;width:100%;max-width:350px;}</style></head><body><div class="card shadow"><h3>ADMIN PSB</h3><form action="/login" method="POST"><input name="user" class="form-control mb-3" placeholder="User"><input name="pass" type="password" class="form-control mb-3" placeholder="Pass"><button class="btn btn-success w-100">MASUK</button></form></div></body></html>`);
});

app.get('/admin', (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const data = readData();
    const config = readConfig();
    const tahunAktif = config.tahunAktif || "2026";
    
    const stats = {
        aktif: data.filter(p => p.status === 'Aktif').length,
        non: data.filter(p => p.status === 'Tidak Aktif').length,
        mts: data.filter(p => p.jenjang === 'SMP/MTs').length,
        ma: data.filter(p => p.jenjang === 'SMA/MA').length
    };

    const rowsSantri = data.map((p, index) => {
        const fotoUrl = p.berkas.foto ? '/uploads/' + p.berkas.foto : 'https://via.placeholder.com/40x50';
        const btnB = (file, label, color) => file ? `<a href="/uploads/${file}" target="_blank" class="btn btn-xs ${color} fw-bold" style="font-size:10px;">${label}</a>` : `<button class="btn btn-xs btn-light disabled" style="font-size:10px;">${label}</button>`;

        return `<tr class="santri-row" data-name="${(p.nama || '').toLowerCase()}">
            <td>${index + 1}</td>
            <td><img src="${fotoUrl}" style="width:40px;height:50px;object-fit:cover;border-radius:5px;"></td>
            <td><b>${p.nama}</b><br><small class="text-muted">Daftar: ${p.tanggal || p.tahunDaftar || '-'}</small></td>
            <td>${p.jenjang || '-'}</td>
            <td><div class="d-flex gap-1">${btnB(p.berkas.foto, 'FOTO', 'btn-primary')} ${btnB(p.berkas.ijazah, 'IJAZAH', 'btn-secondary')}</div></td>
            <td><select class="form-select form-select-sm" onchange="updateStatus(${p.id}, this.value)">
                <option value="Aktif" ${p.status === 'Aktif' ? 'selected' : ''}>🟢 Aktif</option>
                <option value="Tidak Aktif" ${p.status === 'Tidak Aktif' ? 'selected' : ''}>🔴 Tidak Aktif</option>
            </select></td>
            <td><button class="btn btn-sm btn-success w-100" onclick="lihatDetail(${p.id})">DETAIL</button></td>
        </tr>`;
    }).join('');

    const cardsBayar = data.map((p) => {
        const months = ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];
        const createCheck = (prefix) => months.map(m => {
            const lunas = p.pembayaran[tahunAktif] && p.pembayaran[tahunAktif][prefix + '-' + m];
            return `<div class="col-6 mb-2"><div class="form-check p-1 border rounded ${lunas ? 'bg-light' : 'bg-white shadow-sm'}">
                    <input class="form-check-input pay-check" type="checkbox" id="${prefix}-${p.id}-${m}" data-id="${prefix}-${m}" data-price="${prefix === 'p' ? config.biayaPondok : config.biayaMakan}" ${lunas ? 'checked disabled' : ''} onchange="hitungTotal(${p.id})">
                    <label class="form-check-label small ${lunas ? 'text-success' : ''}">${m}</label></div></div>`;
        }).join('');

        return `<div class="bayar-row mb-4" data-name="${(p.nama || '').toLowerCase()}" id="card-${p.id}" style="display: none;">
            <div class="card shadow-sm border-0 rounded-4">
                <div class="card-header bg-success text-white"><h6 class="mb-0">${p.nama}</h6></div>
                <div class="card-body row">
                    <div class="col-6 border-end text-center"><p class="fw-bold small mb-2 text-success">PONDOK</p><div class="row">${createCheck('p')}</div></div>
                    <div class="col-6 text-center"><p class="fw-bold small mb-2 text-primary">MAKAN</p><div class="row">${createCheck('m')}</div></div>
                </div>
                <div class="card-footer bg-light d-flex justify-content-between align-items-center">
                    <div><small>Total:</small><h4 class="text-success fw-bold mb-0">Rp <span id="total-${p.id}">0</span></h4></div>
                    <button class="btn btn-success fw-bold px-4" onclick="prosesBayar(${p.id})">KONFIRMASI BAYAR</button>
                </div>
            </div>
        </div>`;
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <title>Panel Admin PSB</title>
            <style>
                body { background:#f4f7f6; font-family: sans-serif; }
                .sidebar { min-width: 240px; background: #1e4d2b; min-height: 100vh; color: white; position: sticky; top: 0; }
                .sidebar .nav-link { color: rgba(255,255,255,0.7); padding: 12px 20px; text-align:left; border:none; background:none; width:100%; }
                .sidebar .nav-link.active { background: rgba(255,255,255,0.1); color: white; }
                .main-content { padding: 25px; width: 100%; }
                .stat-card { border: none; border-radius: 15px; color: white; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar shadow">
                    <div class="p-4 text-center border-bottom border-white border-opacity-10 mb-3"><h4 class="fw-bold">ADMIN PSB</h4></div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link active" data-bs-toggle="pill" data-bs-target="#v-dash"><i class="fas fa-th-large me-2"></i> Dashboard</button>
                        <button class="nav-link" data-bs-toggle="pill" data-bs-target="#v-santri"><i class="fas fa-users me-2"></i> Data Santri</button>
                        <button class="nav-link" data-bs-toggle="pill" data-bs-target="#v-bayar"><i class="fas fa-check-double me-2"></i> Pembayaran</button>
                        <button class="nav-link" data-bs-toggle="pill" data-bs-target="#v-set"><i class="fas fa-cog me-2"></i> Setting</button>
                        <hr class="mx-3"><a href="/logout" class="nav-link text-danger"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>
                <div class="main-content">
                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="v-dash">
                            <h3 class="fw-bold text-success mb-4 text-uppercase">Dashboard</h3>
                            <div class="row g-3">
                                <div class="col-md-3"><div class="card stat-card bg-success p-3"><h6>Aktif</h6><h2>${stats.aktif}</h2></div></div>
                                <div class="col-md-3"><div class="card stat-card bg-danger p-3"><h6>Non-Aktif</h6><h2>${stats.non}</h2></div></div>
                                <div class="col-md-3"><div class="card stat-card bg-info p-3"><h5>MTs</h5><h2>${stats.mts}</h2></div></div>
                                <div class="col-md-3"><div class="card stat-card bg-warning text-dark p-3"><h5>MA</h5><h2>${stats.ma}</h2></div></div>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="v-santri">
                            <div class="d-flex justify-content-between mb-3"><h4 class="fw-bold text-success">DATA SANTRI</h4><input class="form-control w-25 rounded-pill shadow-sm" placeholder="Cari..." onkeyup="filterT('santri-row', this.value, false)"></div>
                            <div class="card border-0 shadow-sm p-3 rounded-4 bg-white table-responsive"><table class="table table-hover align-middle"><thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Berkas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rowsSantri}</tbody></table></div>
                        </div>

                        <div class="tab-pane fade" id="v-bayar">
                            <div class="d-flex justify-content-between mb-4"><h4 class="fw-bold text-success">CEKLIST PEMBAYARAN ${tahunAktif}</h4><input class="form-control w-25 rounded-pill shadow-sm" placeholder="Cari santri..." onkeyup="filterT('bayar-row', this.value, true)"></div>
                            <div id="payment-container"><div id="hint-bayar" class="text-center py-5 text-muted"><h5><i class="fas fa-search me-2"></i> Cari nama santri...</h5></div>${cardsBayar}</div>
                        </div>

                        <div class="tab-pane fade" id="v-set">
                            <h4 class="fw-bold text-success mb-4 text-uppercase">Pengaturan Sistem</h4>
                            <div class="card border-0 shadow-sm p-4 rounded-4 bg-white" style="max-width: 450px;">
                                <div class="mb-3"><label class="form-label fw-bold small">Tahun Ajaran Aktif</label><input id="cfgT" class="form-control" value="${tahunAktif}"></div>
                                <div class="mb-3"><label class="form-label fw-bold small">Biaya Pondok (Rp)</label><input id="cfgP" class="form-control" value="${config.biayaPondok}"></div>
                                <div class="mb-3"><label class="form-label fw-bold small">Biaya Makan (Rp)</label><input id="cfgM" class="form-control" value="${config.biayaMakan}"></div>
                                <button class="btn btn-success fw-bold w-100" onclick="simpanC()">SIMPAN</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal fade" id="mD" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content border-0 rounded-4 shadow-lg"><div class="modal-body p-4" id="isiM"></div></div></div></div>
            
            <div class="modal fade" id="mK" data-bs-backdrop="static" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content border-0 rounded-4 shadow-lg"><div class="modal-body p-0" id="isiK"></div></div></div></div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                const DATA_SANTRI = ${JSON.stringify(data)};
                const THN_AKTIF = "${tahunAktif}";

                function filterT(c, q, strict) {
                    const rows = document.getElementsByClassName(c);
                    const query = q.toLowerCase().trim();
                    const hint = document.getElementById('hint-bayar');
                    if (strict) {
                        if (query === "") { if(hint) hint.style.display = 'block'; for (let r of rows) r.style.display = 'none'; }
                        else { if(hint) hint.style.display = 'none'; for (let r of rows) { r.style.display = (r.getAttribute('data-name')||'').includes(query) ? '' : 'none'; } }
                    } else { for (let r of rows) { r.style.display = (r.getAttribute('data-name')||'').includes(query) ? '' : 'none'; } }
                }

                function hitungTotal(id) {
                    const card = document.getElementById('card-' + id);
                    const checks = card.querySelectorAll('.pay-check:checked:not(:disabled)');
                    let total = 0;
                    checks.forEach(c => { total += parseInt(c.getAttribute('data-price').replace(/\\./g, '')); });
                    document.getElementById('total-' + id).innerText = total.toLocaleString('id-ID');
                }

                function downloadPDF(nama) {
                    const el = document.getElementById('area-cetak');
                    const opt = { margin: 10, filename: 'Kwitansi_'+nama+'.pdf', image: { type:'jpeg', quality:0.98 }, html2canvas: { scale:2 }, jsPDF: { unit:'mm', format:'a4', orientation:'portrait' } };
                    html2pdf().set(opt).from(el).save();
                }

                function tampilkanKwitansi(nama, total, rincian, wa) {
                    let cleanWa = wa ? wa.replace(/^0/, '62') : '';
                    let rows = ''; let waTxt = '';
                    rincian.forEach(it => {
                        rows += '<tr><td style="padding:10px; border:1px solid #ddd;">'+it.ket+'</td><td style="padding:10px; border:1px solid #ddd; text-align:right;">Rp '+parseInt(it.hrg).toLocaleString('id-ID')+'</td></tr>';
                        waTxt += '- ' + it.ket + ': Rp ' + parseInt(it.hrg).toLocaleString('id-ID') + '%0A';
                    });
                    let msg = 'Assalamu%27alaikum.%0APembayaran%20santri%20*'+encodeURIComponent(nama)+'*%20sebesar%20*Rp%20'+total+'*%20telah%20kami%20terima.%0A%0A*Rincian%3A*%0A'+waTxt+'%0A*TOTAL%3A%20Rp%20'+total+'*%0ATerima%20kasih.';
                    let waLink = 'https://wa.me/'+cleanWa+'?text='+msg;
                    let html = '<div id="area-cetak" style="padding:40px; background:white; color:#333;"><div style="text-align:center; border-bottom:2px solid #1e4d2b; padding-bottom:15px; margin-bottom:20px;"><h2 style="margin:0; color:#1e4d2b;">KWITANSI PEMBAYARAN</h2><p style="margin:0;">Pesantren PSB Ihya</p></div><p>Telah terima dari: <b>'+nama+'</b></p><table style="width:100%; border-collapse:collapse; margin-bottom:20px;"><thead style="background:#f2f2f2;"><tr><th style="padding:10px; border:1px solid #ddd; text-align:left;">Keterangan</th><th style="padding:10px; border:1px solid #ddd; text-align:right; width:150px;">Biaya</th></tr></thead><tbody>'+rows+'</tbody><tfoot style="font-weight:bold; background:#f2f2f2;"><tr><td style="padding:10px; border:1px solid #ddd;">TOTAL AKHIR</td><td style="padding:10px; border:1px solid #ddd; text-align:right; color:#1e4d2b;">Rp '+total+'</td></tr></tfoot></table><div style="margin-top:40px; display:flex; justify-content:space-between;"><div style="text-align:center; width:150px;"><p style="font-size:12px;">Orang Tua</p><br><br><p>( ..................... )</p></div><div style="text-align:center; width:150px;"><p style="font-size:12px;">Admin Pondok</p><br><br><p style="color:#1e4d2b; font-weight:bold; border:1px solid #1e4d2b; padding:2px 5px;">LUNAS</p></div></div></div>';
                    html += '<div class="p-4 bg-light d-flex flex-column gap-2 border-top"><button onclick="downloadPDF(\\''+nama.replace(/'/g, "\\\\'")+'\\')" class="btn btn-danger fw-bold"><i class="fas fa-file-pdf me-2"></i>DOWNLOAD PDF</button><a href="'+waLink+'" target="_blank" class="btn btn-success fw-bold text-center"><i class="fab fa-whatsapp me-2"></i>KIRIM WHATSAPP</a><button class="btn btn-secondary" onclick="location.reload()">TUTUP</button></div>';
                    document.getElementById('isiK').innerHTML = html;
                    new bootstrap.Modal(document.getElementById('mK')).show();
                }

                function prosesBayar(id) {
                    const s = DATA_SANTRI.find(x => x.id == id);
                    const total = document.getElementById('total-' + id).innerText;
                    if(total === "0") return alert("Pilih bulan!");
                    const checks = document.getElementById('card-'+id).querySelectorAll('.pay-check:checked:not(:disabled)');
                    const itemIds = Array.from(checks).map(c => c.getAttribute('data-id'));
                    let rincian = [];
                    checks.forEach(c => {
                        let isP = c.id.startsWith('p-');
                        rincian.push({ ket: (isP ? 'Bulanan Pondok' : 'Bulanan Makan') + ' ('+c.nextElementSibling.innerText+')', hrg: c.getAttribute('data-price').replace(/\\./g, '') });
                    });
                    if(confirm("Bayar Rp " + total + "?")) {
                        fetch('/admin/konfirmasi-bayar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ santriId: id, tahun: THN_AKTIF, itemIds: itemIds }) })
                        .then(res => res.json()).then(d => { if(d.success) tampilkanKwitansi(s.nama, total, rincian, s.whatsapp); });
                    }
                }

                function lihatDetail(id) {
                    const d = DATA_SANTRI.find(x => x.id == id);
                    let html = '<div id="detail-view"><div class="d-flex align-items-center mb-4"><img src="/uploads/'+(d.berkas.foto||'')+'" class="rounded shadow me-3" style="width:100px; height:125px; object-fit:cover; border:3px solid #1e4d2b;"><div><h3 class="fw-bold text-success mb-0">'+d.nama+'</h3><p class="text-muted small">'+(d.jenjang||'-')+'</p></div></div>';
                    html += '<div class="row border-top pt-3"><div class="col-md-6 border-end"><h6>DATA PRIBADI</h6><p class="small"><b>NISN:</b> '+(d.nisn||'-')+'<br><b>NIK:</b> '+(d.nik||'-')+'<br><b>Tgl Daftar:</b> '+(d.tanggal||d.tahunDaftar||'-')+'<br><b>Alamat:</b> '+(d.alamat||'-')+'</p></div>';
                    html += '<div class="col-md-6 ps-4"><h6>ORANG TUA</h6><p class="small"><b>Ayah:</b> '+d.namaAyah+'<br><b>WA:</b> '+d.whatsapp+'</p></div></div>';
                    html += '<div class="mt-4 pt-3 border-top d-flex gap-2"><button class="btn btn-warning fw-bold text-white px-4" onclick="modeEdit('+d.id+')"><i class="fas fa-edit me-2"></i>EDIT DATA</button><button class="btn btn-outline-danger fw-bold px-4" onclick="hapusSantri('+d.id+', \\''+d.nama.replace(/'/g, "\\\\'")+'\\')"><i class="fas fa-trash-alt me-2"></i>HAPUS</button><button class="btn btn-secondary px-4 ms-auto" data-bs-dismiss="modal">TUTUP</button></div></div>';
                    
                    // FORM EDIT (Hidden)
                    html += '<div id="edit-view" style="display:none;"><h4 class="fw-bold text-success mb-4">EDIT DATA SANTRI</h4><div class="row g-3">';
                    html += '<div class="col-md-6"><label class="form-label small fw-bold">Nama Lengkap</label><input id="enama" class="form-control" value="'+d.nama+'"></div>';
                    html += '<div class="col-md-6"><label class="form-label small fw-bold">Jenjang</label><select id="ejenjang" class="form-select"><option value="SMP/MTs" '+(d.jenjang=="SMP/MTs"?"selected":"")+'>SMP/MTs</option><option value="SMA/MA" '+(d.jenjang=="SMA/MA"?"selected":"")+'>SMA/MA</option></select></div>';
                    html += '<div class="col-md-6"><label class="form-label small fw-bold">NISN</label><input id="enisn" class="form-control" value="'+(d.nisn||'')+'"></div>';
                    html += '<div class="col-md-6"><label class="form-label small fw-bold">NIK</label><input id="enik" class="form-control" value="'+(d.nik||'')+'"></div>';
                    html += '<div class="col-md-12"><label class="form-label small fw-bold">Alamat</label><input id="ealamat" class="form-control" value="'+(d.alamat||'')+'"></div>';
                    html += '<div class="col-md-6"><label class="form-label small fw-bold">Nama Ayah</label><input id="eayah" class="form-control" value="'+d.namaAyah+'"></div>';
                    html += '<div class="col-md-6"><label class="form-label small fw-bold">WhatsApp</label><input id="ewa" class="form-control" value="'+d.whatsapp+'"></div>';
                    html += '</div><div class="mt-4 pt-3 border-top d-flex gap-2"><button class="btn btn-success fw-bold px-4" onclick="simpanEdit('+d.id+')">SIMPAN PERUBAHAN</button><button class="btn btn-light border px-4" onclick="modeDetail()">BATAL</button></div></div>';
                    
                    document.getElementById('isiM').innerHTML = html;
                    new bootstrap.Modal(document.getElementById('mD')).show();
                }

                function modeEdit() { document.getElementById('detail-view').style.display = 'none'; document.getElementById('edit-view').style.display = 'block'; }
                function modeDetail() { document.getElementById('detail-view').style.display = 'block'; document.getElementById('edit-view').style.display = 'none'; }

                function simpanEdit(id) {
                    const data = {
                        id,
                        nama: document.getElementById('enama').value,
                        jenjang: document.getElementById('ejenjang').value,
                        nisn: document.getElementById('enisn').value,
                        nik: document.getElementById('enik').value,
                        alamat: document.getElementById('ealamat').value,
                        namaAyah: document.getElementById('eayah').value,
                        whatsapp: document.getElementById('ewa').value
                    };
                    fetch('/admin/edit-santri', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) })
                    .then(res => res.json()).then(d => { if(d.success) location.reload(); });
                }

                function hapusSantri(id, nama) {
                    if(confirm("Apakah Anda yakin ingin menghapus data santri: " + nama + "?\\nSemua data pembayaran juga akan hilang.")) {
                        fetch('/admin/hapus-santri', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) })
                        .then(res => res.json()).then(d => { if(d.success) location.reload(); });
                    }
                }

                function updateStatus(id, s) { fetch('/admin/update-status', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, status: s}) }).then(res => res.json()).then(d => { if(d.success) location.reload(); }); }
                function simpanC() { fetch('/admin/update-config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ tahunAktif: document.getElementById('cfgT').value, biayaPondok: document.getElementById('cfgP').value, biayaMakan: document.getElementById('cfgM').value }) }).then(res => res.json()).then(d => { if(d.success) location.reload(); }); }
            </script>
        </body></html>`);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log("Server aktif di port: " + PORT); });