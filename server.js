const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');

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
    
    const santriAktif = data.filter(p => p.status === 'Aktif').length;
    const santriTidakAktif = data.filter(p => p.status === 'Tidak Aktif').length;
    const santriMTs = data.filter(p => p.jenjang === 'SMP/MTs').length;
    const santriMA = data.filter(p => p.jenjang === 'SMA/MA').length;

    const rowsSantri = data.map((p, index) => {
        const fotoUrl = p.berkas.foto ? '/uploads/' + p.berkas.foto : 'https://via.placeholder.com/40x50';
        const btnB = (file, label, color) => {
            if(!file) return '<button class="btn btn-xs btn-light disabled" style="font-size:0.65rem; padding:2px 5px;">'+label+'</button>';
            return '<a href="/uploads/'+file+'" target="_blank" class="btn btn-xs '+color+' fw-bold" style="font-size:0.65rem; padding:2px 5px;">'+label+'</a>';
        };

        return '<tr class="santri-row" data-name="'+(p.nama || '').toLowerCase()+'">' +
            '<td class="text-center small">'+(index + 1)+'</td>' +
            '<td class="text-center"><img src="'+fotoUrl+'" style="width:40px; height:50px; object-fit:cover; border-radius:5px; border:1px solid #ddd;"></td>' +
            '<td><b>'+p.nama+'</b><br><small class="text-muted" style="font-size:0.7rem;">Daftar: '+(p.tanggal || p.tahunDaftar || '-')+'</small></td>' +
            '<td class="text-center small">'+(p.jenjang || '-')+'</td>' +
            '<td><div class="d-flex flex-wrap gap-1">' +
                btnB(p.berkas.foto, 'FOTO', 'btn-primary') +
                btnB(p.berkas.ijazah, 'IJAZAH', 'btn-secondary') +
                btnB(p.berkas.kk, 'KK', 'btn-info text-white') +
                btnB(p.berkas.ktp, 'KTP', 'btn-warning') +
            '</div></td>' +
            '<td><select class="form-select form-select-sm fw-bold" onchange="updateStatus('+p.id+', this.value)">' +
                '<option value="Aktif" '+(p.status === 'Aktif' ? 'selected' : '')+'>🟢 Aktif</option>' +
                '<option value="Tidak Aktif" '+(p.status === 'Tidak Aktif' ? 'selected' : '')+'>🔴 Tidak Aktif</option>' +
            '</select></td>' +
            '<td><button class="btn btn-sm btn-success w-100 fw-bold shadow-sm" onclick="lihatDetail('+p.id+')">DETAIL</button></td>' +
        '</tr>';
    }).join('');

    const cardsBayar = data.map((p) => {
        const months = ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];
        const isTidakAktif = p.status === 'Tidak Aktif';

        const createCheck = (prefix) => months.map(m => {
            const lunas = p.pembayaran[tahunAktif] && p.pembayaran[tahunAktif][prefix + '-' + m];
            return '<div class="col-6 mb-2"><div class="form-check p-1 border rounded '+(lunas ? 'bg-light border-success' : 'bg-white shadow-sm')+'">' +
                    '<input class="form-check-input ms-1 me-1 pay-check" type="checkbox" id="'+prefix+'-'+p.id+'-'+m+'" data-id="'+prefix+'-'+m+'" data-price="'+(prefix === 'p' ? config.biayaPondok : config.biayaMakan)+'" '+(lunas ? 'checked disabled' : '')+' onchange="hitungTotal('+p.id+')">' +
                    '<label class="form-check-label fw-bold small '+(lunas ? 'text-success' : '')+'">'+m+'</label></div></div>';
        }).join('');

        let bodyHTML = '<div class="row g-3"><div class="col-md-6 border-end text-center"><p class="fw-bold text-success border-bottom pb-1 mb-2 small text-uppercase">Pondok</p><div class="row gx-1">'+createCheck('p')+'</div></div>' +
                       '<div class="col-md-6 text-center"><p class="fw-bold text-primary border-bottom pb-1 mb-2 small text-uppercase">Makan</p><div class="row gx-1">'+createCheck('m')+'</div></div></div>';

        if (isTidakAktif) bodyHTML = '<div class="py-5 text-center"><h5 class="text-danger fw-bold">SANTRI TIDAK AKTIF</h5></div>';

        return '<div class="bayar-row mb-4" data-name="'+(p.nama || '').toLowerCase()+'" id="card-'+p.id+'" style="display: none;">' +
            '<div class="card border-0 shadow-sm rounded-4">' +
                '<div class="card-header bg-success text-white py-2"><h6 class="mb-0 fw-bold">'+p.nama+'</h6></div>' +
                '<div class="card-body p-3">'+bodyHTML+'</div>' +
                '<div class="card-footer bg-light border-0 d-flex justify-content-between align-items-center py-3">' +
                    '<div><span class="text-muted small fw-bold">Tagihan:</span><h4 class="text-success fw-bold mb-0">Rp <span id="total-'+p.id+'">0</span></h4></div>' +
                    '<button class="btn btn-success fw-bold px-4 py-2 rounded-3" onclick="prosesBayar('+p.id+')">KONFIRMASI BAYAR</button>' +
                '</div>' +
            '</div>' +
        '</div>';
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
                .sidebar { min-width: 240px; background: #1e4d2b; min-height: 100vh; color: white; position: sticky; top: 0; }
                .sidebar .nav-link { color: rgba(255,255,255,0.7); margin: 5px 15px; border-radius: 10px; border:none; background:none; text-align:left; width:88%; }
                .sidebar .nav-link.active { background: rgba(255,255,255,0.15) !important; color: white; }
                .main-content { width: 100%; padding: 25px; }
                .stat-card { border: none; border-radius: 15px; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
                #hint-bayar { padding: 80px 20px; color: #888; text-align: center; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar shadow">
                    <div class="p-4 text-center border-bottom border-white border-opacity-10 mb-3"><h4 class="fw-bold">ADMIN PSB</h4></div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link active mb-2" data-bs-toggle="pill" data-bs-target="#v-dash">Dashboard</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-santri">Data Santri</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-bayar">Pembayaran</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-set">Setting</button>
                        <hr class="mx-3"><a href="/logout" class="nav-link text-danger mt-4">Logout</a>
                    </div>
                </nav>
                <div class="main-content">
                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="v-dash">
                            <h3 class="fw-bold text-success mb-4 text-uppercase">Dashboard</h3>
                            <div class="row g-3 mb-4">
                                <div class="col-md-4"><div class="card stat-card bg-success p-3"><h6>Aktif</h6><h2>${santriAktif}</h2></div></div>
                                <div class="col-md-4"><div class="card stat-card bg-danger p-3"><h6>Tidak Aktif</h6><h2>${santriTidakAktif}</h2></div></div>
                                <div class="col-md-4"><div class="card stat-card bg-primary p-3"><h6>Total</h6><h2>${data.length}</h2></div></div>
                                <div class="col-md-6"><div class="card stat-card bg-info p-4"><h5>MTs</h5><h1>${santriMTs}</h1></div></div>
                                <div class="col-md-6"><div class="card stat-card bg-warning text-dark p-4"><h5>MA</h5><h1>${santriMA}</h1></div></div>
                            </div>
                        </div>
                        <div class="tab-pane fade" id="v-santri">
                            <div class="d-flex justify-content-between mb-3 align-items-center"><h4 class="fw-bold text-success">Data Santri</h4><input class="form-control w-25 rounded-pill" placeholder="Cari nama..." onkeyup="filterT('santri-row', this.value, false)"></div>
                            <div class="card border-0 shadow-sm p-3 rounded-4 bg-white table-responsive"><table class="table table-hover align-middle"><thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Berkas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rowsSantri}</tbody></table></div>
                        </div>
                        <div class="tab-pane fade" id="v-bayar">
                            <div class="d-flex justify-content-between mb-4 align-items-center"><h4 class="fw-bold text-success">Pembayaran ${tahunAktif}</h4><input class="form-control w-25 rounded-pill" placeholder="Cari santri..." onkeyup="filterT('bayar-row', this.value, true)"></div>
                            <div id="payment-container"><div id="hint-bayar"><h5><i class="fas fa-search me-2"></i> Cari nama santri...</h5></div>${cardsBayar}</div>
                        </div>
                        <div class="tab-pane fade" id="v-set">
                            <h4 class="fw-bold text-success mb-4">Pengaturan</h4>
                            <div class="card border-0 shadow-sm p-4 rounded-4 bg-white" style="max-width: 450px;">
                                <div class="mb-3"><label class="form-label">Tahun Ajaran</label><input id="cfgT" class="form-control" value="${tahunAktif}"></div>
                                <div class="mb-3"><label class="form-label">Biaya Pondok</label><input id="cfgP" class="form-control" value="${config.biayaPondok}"></div>
                                <div class="mb-4"><label class="form-label">Biaya Makan</label><input id="cfgM" class="form-control" value="${config.biayaMakan}"></div>
                                <button class="btn btn-success w-100" onclick="simpanC()">SIMPAN PERUBAHAN</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal fade" id="mKwitansi" data-bs-backdrop="static" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content border-0 rounded-4 overflow-hidden"><div class="modal-body p-0" id="isiKwitansi"></div></div></div></div>
            <div class="modal fade" id="mD" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content border-0 rounded-4 overflow-hidden"><div class="modal-body p-4" id="isiM"></div></div></div></div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                const DB_SANTRI = ${JSON.stringify(data)};
                const THN_AKTIF = "${tahunAktif}";

                function downloadPDF(nama) {
                    const el = document.getElementById('area-cetak-kwitansi');
                    const opt = { 
                        margin: 10, filename: 'Kwitansi_' + nama.replace(/ /g, '_') + '.pdf', 
                        image: { type: 'jpeg', quality: 0.98 }, 
                        html2canvas: { scale: 2 }, 
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
                    };
                    html2pdf().set(opt).from(el).save();
                }

                function filterT(c, q, strict) {
                    const rows = document.getElementsByClassName(c);
                    const query = q.toLowerCase().trim();
                    const hint = document.getElementById('hint-bayar');
                    if (strict) {
                        if (query === "") {
                            if(hint) hint.style.display = 'block';
                            for (let r of rows) r.style.display = 'none';
                        } else {
                            if(hint) hint.style.display = 'none';
                            for (let r of rows) { r.style.display = (r.getAttribute('data-name')||'').includes(query) ? '' : 'none'; }
                        }
                    } else {
                        for (let r of rows) { r.style.display = (r.getAttribute('data-name')||'').includes(query) ? '' : 'none'; }
                    }
                }

                function hitungTotal(id) {
                    const card = document.getElementById('card-' + id);
                    const checks = card.querySelectorAll('.pay-check:checked:not(:disabled)');
                    let total = 0;
                    checks.forEach(c => { total += parseInt(c.getAttribute('data-price').replace(/\\./g, '')); });
                    document.getElementById('total-' + id).innerText = total.toLocaleString('id-ID');
                }

                function tampilkanKwitansi(nama, total, items, wa) {
                    let cleanWa = wa ? wa.replace(/^0/, '62') : '';
                    let tglSkrg = new Date().toLocaleString('id-ID');
                    let tableRows = '';
                    let waRincian = '';
                    
                    items.forEach(item => {
                        tableRows += '<tr><td style="padding:8px; border:1px solid #ddd;">'+item.ket+'</td><td style="padding:8px; border:1px solid #ddd; text-align:right;">Rp '+parseInt(item.harga).toLocaleString('id-ID')+'</td></tr>';
                        waRincian += '- ' + item.ket + ': Rp ' + parseInt(item.harga).toLocaleString('id-ID') + '%0A';
                    });

                    let msg = 'Assalamu%27alaikum.%0A%0APembayaran%20santri%20a.n%20*'+encodeURIComponent(nama)+'*%20telah%20berhasil%20diterima.%0A%0A*Rincian%3A*%0A'+waRincian+'%0A*Total%3A%20Rp%20'+total+'*%0A%0ATerima%20kasih.';
                    let waLink = 'https://wa.me/' + cleanWa + '?text=' + msg;

                    let html = '<div id="area-cetak-kwitansi" style="padding:40px; background:white; color:#333; font-family:sans-serif;">';
                    html += '<div style="text-align:center; border-bottom:2px solid #1e4d2b; padding-bottom:15px; margin-bottom:20px;"><h2 style="margin:0; color:#1e4d2b;">KWITANSI PEMBAYARAN</h2><p style="margin:0;">Pesantren PSB Ihya</p></div>';
                    html += '<p>Telah terima dari: <b>'+nama+'</b></p>';
                    html += '<table style="width:100%; border-collapse:collapse; margin-bottom:20px;"><thead style="background:#f9f9f9;"><tr><th style="padding:8px; border:1px solid #ddd; text-align:left;">Keterangan</th><th style="padding:8px; border:1px solid #ddd; text-align:right;">Biaya</th></tr></thead>';
                    html += '<tbody>'+tableRows+'</tbody>';
                    html += '<tfoot style="font-weight:bold; background:#f9f9f9;"><tr><td style="padding:8px; border:1px solid #ddd;">TOTAL PEMBAYARAN</td><td style="padding:8px; border:1px solid #ddd; text-align:right; color:#1e4d2b;">Rp '+total+'</td></tr></tfoot></table>';
                    html += '<div style="margin-top:40px; display:flex; justify-content:space-between;"><div style="text-align:center; width:150px;"><p style="font-size:12px;">Orang Tua Santri</p><br><br><p>( ..................... )</p></div><div style="text-align:center; width:150px;"><p style="font-size:12px;">Admin Pondok</p><br><br><p style="color:#1e4d2b; font-weight:bold;">LUNAS</p></div></div></div>';
                    
                    html += '<div class="p-4 bg-light d-flex flex-column gap-2 border-top">';
                    html += '<button onclick="downloadPDF(\\''+nama.replace(/'/g, "\\\\'")+'\\')" class="btn btn-danger fw-bold p-2"><i class="fas fa-file-pdf me-2"></i>Download PDF Kwitansi</button>';
                    html += '<a href="'+waLink+'" target="_blank" class="btn btn-success fw-bold p-2 text-center"><i class="fab fa-whatsapp me-2"></i>Kirim WA ke Orang Tua</a>';
                    html += '<button class="btn btn-secondary fw-bold p-2" onclick="location.reload()">Tutup</button></div>';
                    
                    document.getElementById('isiKwitansi').innerHTML = html;
                    new bootstrap.Modal(document.getElementById('mKwitansi')).show();
                }

                function prosesBayar(id) {
                    const s = DB_SANTRI.find(x => x.id == id);
                    const total = document.getElementById('total-' + id).innerText;
                    if(total === "0") return alert("Pilih bulan!");
                    const checks = document.getElementById('card-'+id).querySelectorAll('.pay-check:checked:not(:disabled)');
                    const itemIds = Array.from(checks).map(c => c.getAttribute('data-id'));
                    
                    let itemsData = [];
                    checks.forEach(c => {
                        let isPondok = c.id.startsWith('p-');
                        itemsData.push({
                            ket: isPondok ? 'Bulanan Pondok ('+c.nextElementSibling.innerText+')' : 'Bulanan Makan ('+c.nextElementSibling.innerText+')',
                            harga: c.getAttribute('data-price').replace(/\\./g, '')
                        });
                    });

                    if(confirm("Bayar Rp " + total + " untuk " + s.nama + "?")) {
                        fetch('/admin/konfirmasi-bayar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ santriId: id, tahun: THN_AKTIF, itemIds: itemIds }) })
                        .then(res => res.json()).then(d => { if(d.success) tampilkanKwitansi(s.nama, total, itemsData, s.whatsapp); });
                    }
                }
                
                function updateStatus(id, s) { fetch('/admin/update-status', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, status: s}) }).then(res => res.json()).then(d => { if(d.success) location.reload(); }); }
                function simpanC() { fetch('/admin/update-config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ tahunAktif: document.getElementById('cfgT').value, biayaPondok: document.getElementById('cfgP').value, biayaMakan: document.getElementById('cfgM').value }) }).then(res => res.json()).then(d => { if(d.success) { alert('Tersimpan!'); location.reload(); } }); }
                
                function lihatDetail(id) { 
                    const d = DB_SANTRI.find(x => x.id == id);
                    let html = '<div class="d-flex align-items-center mb-4">';
                    html += '<img src="/uploads/' + (d.berkas.foto || '') + '" class="rounded shadow me-3" style="width:100px; height:125px; object-fit:cover; border:3px solid #1e4d2b;">';
                    html += '<div><h3 class="fw-bold text-success mb-0">' + d.nama + '</h3><p class="text-muted small">' + d.jenjang + '</p></div></div>';
                    html += '<div class="row border-top pt-3"><div class="col-md-6 border-end"><h6>DATA PRIBADI</h6>';
                    html += '<p class="small"><b>NISN:</b> ' + (d.nisn || '-') + '<br><b>NIK:</b> ' + (d.nik || '-') + '<br>';
                    html += '<b>Tgl Daftar:</b> ' + (d.tanggal || d.tahunDaftar || '-') + '<br><b>Alamat:</b> ' + (d.alamat || '-') + '</p></div>';
                    html += '<div class="col-md-6 ps-4"><h6>ORANG TUA</h6><p class="small">';
                    html += '<b>Ayah:</b> ' + (d.namaAyah || '-') + ' (' + (d.pekerjaanAyah || '-') + ')<br>';
                    html += '<b>Ibu:</b> ' + (d.namaIbu || '-') + ' (' + (d.pekerjaanIbu || '-') + ')<br><b>WA:</b> ' + (d.whatsapp || '-') + '</p></div></div>';
                    document.getElementById('isiM').innerHTML = html; 
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