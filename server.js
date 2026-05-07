const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const ExcelJS = require('exceljs');
const JSZip = require('jszip'); // Library baru untuk ZIP

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
                biayaA: "100.000", 
                biayaB1: "200.000", 
                biayaB2: "100.000", 
                biayaB3: "200.000", 
                biayaPondok: "50.000", 
                biayaMakan: "400.000", 
                biayaE1: "500.000", 
                biayaE2: "200.000", 
                biayaE3: "100.000", 
                tahunAktif: "2026" 
            };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(def));
            return def;
        }
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) { return { biayaA: "100.000", biayaB1: "200.000", biayaB2: "100.000", biayaB3: "200.000", biayaPondok: "0", biayaMakan: "0", biayaE1: "500.000", biayaE2: "200.000", biayaE3: "100.000", tahunAktif: "2026" }; }
};
const saveConfig = (cfg) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));

// --- MIDDLEWARE ---
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
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

// --- ENDPOINT BACKUP & EXPORT ---

// 1. Export Excel
app.get('/admin/export-excel', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).send("Unauthorized");
    const data = readData();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Santri');
    sheet.columns = [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Tanggal Daftar', key: 'tanggal', width: 25 },
        { header: 'Nama Lengkap', key: 'nama', width: 30 },
        { header: 'Jenjang', key: 'jenjang', width: 15 },
        { header: 'NISN', key: 'nisn', width: 15 },
        { header: 'NIK', key: 'nik', width: 20 },
        { header: 'WhatsApp', key: 'whatsapp', width: 20 },
        { header: 'Nama Ayah', key: 'namaAyah', width: 25 },
        { header: 'Status', key: 'status', width: 12 }
    ];
    data.forEach((s, i) => {
        sheet.addRow({ no: i+1, tanggal: s.tanggal, nama: s.nama, jenjang: s.jenjang, nisn: s.nisn, nik: s.nik, whatsapp: s.whatsapp, namaAyah: s.namaAyah, status: s.status });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Data_Santri_PSB.xlsx');
    workbook.xlsx.write(res).then(() => res.end());
});

// 2. Download ZIP Berkas
app.get('/admin/download-berkas-zip', async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).send("Unauthorized");
    const zip = new JSZip();
    const data = readData();

    data.forEach(s => {
        const folderName = s.nama.replace(/[/\\?%*:|"<>]/g, '-');
        const santriFolder = zip.folder(folderName);
        const berkas = s.berkas || {};
        ['foto', 'ijazah', 'kk', 'ktp'].forEach(type => {
            if (berkas[type]) {
                const filePath = path.join(UPLOAD_DIR, berkas[type]);
                if (fs.existsSync(filePath)) {
                    santriFolder.file(type + '_' + berkas[type], fs.readFileSync(filePath));
                }
            }
        });
    });

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=Semua_Berkas_Santri.zip');
    res.send(content);
});

// Endpoint PDF
app.post('/admin/simpan-pdf', (req, res) => {
    if (!req.session.isLoggedIn) return res.status(403).json({ success: false });
    const { filename, pdfBase64 } = req.body;
    const filePath = path.join(UPLOAD_DIR, filename);
    const buffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(filePath, buffer);
    res.json({ success: true, url: '/uploads/' + filename });
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
    const tahunLalu = (parseInt(tahunAktif) - 1).toString();
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

        return '<tr class="santri-row" data-name="'+p.nama.toLowerCase()+'" data-status="'+p.status+'">' +
            '<td class="text-center small">'+(index + 1)+'</td>' +
            '<td class="text-center"><img src="'+fotoUrl+'" style="width:40px; height:50px; object-fit:cover; border-radius:5px; border:1px solid #ddd;"></td>' +
            '<td><b>'+p.nama+'</b><br><small class="text-muted" style="font-size:0.7rem;">Daftar: '+(p.tanggal || p.tahunDaftar)+'</small></td>' +
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

    const rowsTunggakan = data.filter(p => p.status === 'Aktif').map(p => {
        let pMenunggak = months.filter(m => !(p.pembayaran[tahunAktif] && p.pembayaran[tahunAktif]['p-' + m]));
        let mMenunggak = months.filter(m => !(p.pembayaran[tahunAktif] && p.pembayaran[tahunAktif]['m-' + m]));
        if (pMenunggak.length > 0 || mMenunggak.length > 0) {
            const badgeP = pMenunggak.length > 0 ? '<span class="badge bg-danger mb-1 me-1">Poin C: '+pMenunggak.join(', ')+'</span>' : '<span class="badge bg-success mb-1 text-white">Poin C Lunas</span>';
            const badgeM = mMenunggak.length > 0 ? '<span class="badge bg-primary mb-1">Poin D: '+mMenunggak.join(', ')+'</span>' : '<span class="badge bg-success mb-1 text-white">Poin D Lunas</span>';
            return '<tr><td><b>'+p.nama+'</b></td><td>'+badgeP+'<br>'+badgeM+'</td><td><button class="btn btn-sm btn-outline-success fw-bold" onclick="kePembayaran(\''+p.nama.replace(/'/g, "\\'")+'\')">BAYAR</button></td></tr>';
        }
        return null;
    }).filter(x => x !== null).join('');

    const cardsBayar = data.map((p) => {
        const isBaru = p.tahunDaftar === tahunAktif; 
        const createCheckPoinList = (id, label, price) => {
            const lunas = p.pembayaran[tahunAktif] && p.pembayaran[tahunAktif][id];
            return '<div class="col-12 mb-2"><div class="form-check p-2 border rounded '+(lunas ? 'bg-light border-success' : 'bg-white shadow-sm')+'">' +
                    '<input class="form-check-input ms-1 me-2 pay-check" type="checkbox" id="'+id+'-'+p.id+'" ' +
                        'data-id="'+id+'" data-price="'+price+'" data-label="'+label+'" ' +
                        (lunas ? 'checked disabled' : '')+' onchange="hitungTotal('+p.id+')">' +
                    '<label class="form-check-label fw-bold small '+(lunas ? 'text-success' : '')+'">'+label+' <span class="badge bg-secondary ms-2 fw-normal">Rp '+price+'</span></label></div></div>';
        };

        const createCheck = (prefix) => months.map(m => {
            const lunas = p.pembayaran[tahunAktif] && p.pembayaran[tahunAktif][prefix + '-' + m];
            const labelText = prefix === 'p' ? 'Poin C (Pondok) ' + m : 'Poin D (Makan) ' + m;
            return '<div class="col-6 mb-2"><div class="form-check p-1 border rounded '+(lunas ? 'bg-light border-success' : 'bg-white shadow-sm')+'">' +
                    '<input class="form-check-input ms-1 me-1 pay-check" type="checkbox" id="'+prefix+'-'+p.id+'-'+m+'" ' +
                        'data-id="'+prefix+'-'+m+'" data-price="'+(prefix === 'p' ? config.biayaPondok : config.biayaMakan)+'" ' +
                        'data-label="'+labelText+'" ' +
                        (lunas ? 'checked disabled' : '')+' onchange="hitungTotal('+p.id+')">' +
                    '<label class="form-check-label fw-bold small '+(lunas ? 'text-success' : '')+'">'+m+'</label></div></div>';
        }).join('');

        let poinABHtml = isBaru ? '<div class="row gx-2 mb-3 border-bottom pb-3"><p class="fw-bold text-success small text-uppercase mb-3 w-100">Registrasi Awal</p>' +
                '<div class="col-md-6"><p class="small fw-bold text-muted mb-2">POIN A</p>'+createCheckPoinList('poin-a', 'Pendaftaran', config.biayaA)+'</div>' +
                '<div class="col-md-6"><p class="small fw-bold text-muted mb-2">POIN B</p>'+createCheckPoinList('poin-b1', 'Seragam', config.biayaB1)+createCheckPoinList('poin-b2', 'Kitab/Buku', config.biayaB2)+createCheckPoinList('poin-b3', 'Infaq', config.biayaB3)+'</div></div>' : '';

        let poinEHtml = '<div class="row gx-2 mt-2 border-top pt-3"><p class="fw-bold text-secondary small text-uppercase mb-3 w-100">Poin E (Tahunan)</p>' +
            '<div class="col-md-4">'+createCheckPoinList('poin-e1', 'Operasional', config.biayaE1)+'</div>' +
            '<div class="col-md-4">'+createCheckPoinList('poin-e2', 'PHBI', config.biayaE2)+'</div>' +
            '<div class="col-md-4">'+createCheckPoinList('poin-e3', 'Kesehatan', config.biayaE3)+'</div></div>';

        let bodyHTML = '<div class="row g-3"><div class="col-12">'+poinABHtml+'</div>' +
            '<div class="col-md-6 border-end text-center"><p class="fw-bold text-success border-bottom pb-1 mb-2 small text-uppercase">Poin C (Pondok)</p><div class="row gx-1">'+createCheck('p')+'</div></div>' +
            '<div class="col-md-6 text-center"><p class="fw-bold text-primary border-bottom pb-1 mb-2 small text-uppercase">Poin D (Makan)</p><div class="row gx-1">'+createCheck('m')+'</div></div>' +
            '<div class="col-12">'+poinEHtml+'</div></div>';

        return '<div class="bayar-row mb-4" data-name="'+p.nama.toLowerCase()+'" id="card-'+p.id+'" style="display: none;">' +
            '<div class="card border-0 shadow-sm rounded-4">' +
                '<div class="card-header bg-success text-white py-2"><h6><i class="fas fa-user-circle me-1"></i> '+p.nama+' ('+tahunAktif+')</h6></div>' +
                '<div class="card-body p-3">'+bodyHTML+'</div>' +
                '<div class="card-footer bg-light border-0 d-flex justify-content-between align-items-center py-3">' +
                    '<div><span class="text-muted small fw-bold">Total:</span><h4 class="text-success fw-bold mb-0">Rp <span id="total-'+p.id+'">0</span></h4></div>' +
                    '<button class="btn btn-success fw-bold px-4 py-2 rounded-3 shadow-sm" onclick="prosesBayar('+p.id+')">KONFIRMASI BAYAR</button>' +
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
                .sidebar .nav-link { color: rgba(255,255,255,0.7); margin: 5px 15px; border-radius: 12px; border:none; background:none; text-align:left; width:88%; }
                .sidebar .nav-link.active { background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%) !important; color: white; }
                .main-content { width: 100%; padding: 25px; }
                .stat-card { border: none; border-radius: 20px; color: white; box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
                .sidebar-kop { padding: 25px 15px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; text-align: center; }
                .sidebar-kop img { width: 70px; height: 70px; margin-bottom: 12px; border-radius: 50%; background: white; padding: 5px; }
            </style>
        </head>
        <body>
            <div class="d-flex">
                <nav class="sidebar shadow-lg">
                    <div class="sidebar-kop"><img src="/assets/logo-pondok.png" onerror="this.src='https://via.placeholder.com/70'"><h6>PONDOK PESANTREN<br>IHYAUTH THOLIBIN</h6></div>
                    <div class="nav flex-column nav-pills">
                        <button class="nav-link active mb-2" data-bs-toggle="pill" data-bs-target="#v-dash"><i class="fas fa-th-large me-2"></i> Dashboard</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-santri"><i class="fas fa-users me-2"></i> Data Santri</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-tunggakan"><i class="fas fa-exclamation-triangle me-2"></i> Tunggakan</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-bayar"><i class="fas fa-check-double me-2"></i> Pembayaran</button>
                        <button class="nav-link mb-2" data-bs-toggle="pill" data-bs-target="#v-set"><i class="fas fa-cog me-2"></i> Setting</button>
                        <hr class="mx-3 opacity-25"><a href="/logout" class="nav-link text-danger mt-2"><i class="fas fa-sign-out-alt me-2"></i> Logout</a>
                    </div>
                </nav>
                <div class="main-content">
                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="v-dash">
                            <h3 class="fw-bold text-success mb-4 text-uppercase">Dashboard</h3>
                            <div class="row g-3 mb-4">
                                <div class="col-md-3"><div class="card stat-card bg-success p-3"><h6>Aktif</h6><h2>${santriAktifCount}</h2></div></div>
                                <div class="col-md-3"><div class="card stat-card bg-danger p-3"><h6>Tidak Aktif</h6><h2>${santriTidakAktif}</h2></div></div>
                                <div class="col-md-3"><div class="card stat-card bg-info p-3"><h5>MTs</h5><h1>${santriMTs}</h1></div></div>
                                <div class="col-md-3"><div class="card stat-card bg-warning text-dark p-3"><h5>MA</h5><h1>${santriMA}</h1></div></div>
                            </div>
                            <div class="card border-0 shadow-sm p-4 rounded-4 bg-white">
                                <h5 class="fw-bold mb-3"><i class="fas fa-database me-2"></i>Backup Data</h5>
                                <div class="d-flex gap-3">
                                    <a href="/admin/export-excel" class="btn btn-success fw-bold px-4 shadow-sm"><i class="fas fa-file-excel me-2"></i>EXPORT EXCEL</a>
                                    <a href="/admin/download-berkas-zip" class="btn btn-warning fw-bold px-4 shadow-sm text-white"><i class="fas fa-file-archive me-2"></i>DOWNLOAD SEMUA FOTO (ZIP)</a>
                                </div>
                            </div>
                        </div>
                        <div class="tab-pane fade" id="v-santri">
                            <div class="d-flex justify-content-between mb-3 align-items-center"><h4>Data Santri</h4><input id="cari-santri" class="form-control w-25 rounded-pill shadow-sm" placeholder="Cari nama..." onkeyup="filterT('santri-row', this.value)"></div>
                            <div class="card border-0 shadow-sm p-3 rounded-4 bg-white"><div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>No</th><th>Foto</th><th>Nama</th><th>Jenjang</th><th>Berkas</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="santri-body">${rowsSantri}</tbody></table></div></div>
                        </div>
                        <div class="tab-pane fade" id="v-tunggakan">
                            <h4 class="fw-bold text-danger text-uppercase mb-4">Daftar Santri Belum Lunas</h4>
                            <div class="card border-0 shadow-sm p-3 rounded-4 bg-white"><table class="table table-hover align-middle"><thead><tr><th>Nama</th><th>Bulan Belum Dibayar</th><th>Aksi</th></tr></thead><tbody>${rowsTunggakan || '<tr><td colspan="3" class="text-center py-4">Lunas!</td></tr>'}</tbody></table></div>
                        </div>
                        <div class="tab-pane fade" id="v-bayar">
                            <div class="d-flex justify-content-between mb-4 align-items-center"><h4>Pembayaran</h4><div class="input-group input-group-sm w-25 shadow-sm"><span class="input-group-text">Tahun</span><input type="text" id="cfgT" class="form-control text-center" value="${tahunAktif}"><button class="btn btn-success" onclick="simpanC()"><i class="fas fa-save"></i></button></div><input id="cari-bayar" class="form-control w-50 rounded-pill shadow-sm" placeholder="Cari santri..." onkeyup="filterT('bayar-row', this.value, true)"></div>
                            <div id="payment-container"><div id="hint-bayar" class="py-5 text-center text-muted"><h5>🔍 Cari nama santri...</h5></div>${cardsBayar}</div>
                        </div>
                        <div class="tab-pane fade" id="v-set">
                            <h4 class="fw-bold text-success mb-4 text-uppercase">Pengaturan Biaya</h4>
                            <div class="card border-0 shadow-sm p-4 rounded-4 bg-white" style="max-width: 500px;">
                                <div class="mb-3"><label class="form-label">Poin A (Pendaftaran)</label><input type="text" id="cfgA" class="form-control" value="${config.biayaA}"></div>
                                <div class="mb-3"><label class="form-label">Poin C (Bulanan Pondok)</label><input type="text" id="cfgP" class="form-control" value="${config.biayaPondok}"></div>
                                <div class="mb-4"><label class="form-label">Poin D (Bulanan Makan)</label><input type="text" id="cfgM" class="form-control" value="${config.biayaMakan}"></div>
                                <button class="btn btn-success fw-bold w-100" onclick="simpanC()">SIMPAN PERUBAHAN</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal fade" id="mD" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content border-0 rounded-4 overflow-hidden"><div class="modal-body p-4" id="isiM"></div></div></div></div>
            <div class="modal fade" id="mKwitansi" data-bs-backdrop="static" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 rounded-4 overflow-hidden shadow-lg"><div class="modal-body p-4" id="isiKwitansi"></div></div></div></div>

            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script>
                const DB_SANTRI = ${JSON.stringify(data)};

                function filterT(c, q, strict) {
                    const rows = document.getElementsByClassName(c);
                    const query = q.toLowerCase().trim();
                    const hint = document.getElementById('hint-bayar');
                    if(strict) {
                        if(query === "") { if(hint) hint.style.display = ''; for (let r of rows) r.style.display = 'none'; }
                        else { if(hint) hint.style.display = 'none'; for (let r of rows) r.style.display = r.dataset.name.includes(query) ? '' : 'none'; }
                    } else { for (let r of rows) r.style.display = r.dataset.name.includes(query) ? '' : 'none'; }
                }

                function downloadPDF(nama) {
                    const element = document.getElementById('pdf-area');
                    const opt = { margin: 10, filename: 'Kwitansi_'+nama+'.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
                    html2pdf().set(opt).from(element).save();
                }

                function hitungTotal(id) {
                    const card = document.getElementById('card-' + id);
                    const checks = card.querySelectorAll('.pay-check:checked:not(:disabled)');
                    let total = 0;
                    checks.forEach(c => { total += parseInt(c.dataset.price.replace(/\\./g, '')); });
                    document.getElementById('total-' + id).innerText = total.toLocaleString('id-ID');
                }

                function tampilkanKwitansi(nama, total, rincian, wa) {
                    let cleanWa = wa ? wa.replace(/^0/, '62') : '';
                    let tableRows = rincian.map(i => \`<tr><td style="padding:10px; border:1px solid #ddd;">\${i.ket}</td><td style="padding:10px; border:1px solid #ddd; text-align:right;">Rp \${parseInt(i.hrg).toLocaleString('id-ID')}</td></tr>\`).join('');
                    let html = \`
                        <div id="pdf-area" style="padding:30px; font-family:sans-serif; background:white;">
                            <div style="display:flex; align-items:center; border-bottom:2px solid #1e4d2b; padding-bottom:15px; margin-bottom:20px;">
                                <img src="/assets/logo-pondok.png" style="width:60px; height:60px; margin-right:15px;" crossorigin="anonymous" onerror="this.src='https://via.placeholder.com/60'">
                                <div style="text-align:left;"><h3 style="margin:0; color:#1e4d2b; font-weight:bold; font-size:16px;">PONDOK PESANTREN IHYAUTH THOLIBIN</h3><p style="margin:0; font-size:10px;">Jl. Pasar Jumat, Semarang Jaya, Air Hitam, Lampung Barat</p></div>
                            </div>
                            <h5 style="text-align:center; text-decoration:underline;">KWITANSI PEMBAYARAN</h5>
                            <p style="font-size:13px;">Telah terima dari: <b>\${nama}</b></p>
                            <table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#f2f2f2;"><th style="padding:10px; border:1px solid #ddd;">Keterangan</th><th style="padding:10px; border:1px solid #ddd; text-align:right;">Biaya</th></tr></thead><tbody>\${tableRows}</tbody><tfoot><tr style="font-weight:bold;"><td style="padding:10px; border:1px solid #ddd;">TOTAL</td><td style="padding:10px; border:1px solid #ddd; text-align:right; color:#1e4d2b;">Rp \${total}</td></tr></tfoot></table>
                        </div>\`;
                    document.getElementById('isiKwitansi').innerHTML = html + \`
                        <div class="mt-3 d-flex flex-column gap-2">
                            <button id="btn-wa-link" class="btn btn-success fw-bold"><i class="fab fa-whatsapp me-2"></i>KIRIM WA (+ LINK PDF)</button>
                            <button class="btn btn-secondary" onclick="location.reload()">TUTUP</button>
                        </div>\`;
                    new bootstrap.Modal(document.getElementById('mKwitansi')).show();

                    document.getElementById('btn-wa-link').onclick = async () => {
                        const btn = document.getElementById('btn-wa-link');
                        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        const element = document.getElementById('pdf-area');
                        const blob = await html2pdf().from(element).output('blob');
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = async () => {
                            const base64data = reader.result.split(',')[1];
                            const filename = 'Kwitansi_' + nama.replace(/ /g, '_') + '_' + Date.now() + '.pdf';
                            const res = await fetch('/admin/simpan-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, pdfBase64: base64data }) });
                            const result = await res.json();
                            if (result.success) {
                                const fullUrl = window.location.origin + result.url;
                                let msg = 'Assalamu%27alaikum.%0APembayaran%20santri%20*'+encodeURIComponent(nama)+'*%20sebesar%20*Rp%20'+total+'*%20berhasil%20diterima.%0A%0A*UNDUH%20KWITANSI%3A*%0A'+encodeURIComponent(fullUrl);
                                window.open('https://wa.me/'+cleanWa+'?text='+msg, '_blank');
                                location.reload();
                            }
                        };
                    };
                }

                function prosesBayar(id) {
                    const s = DB_SANTRI.find(x => x.id == id);
                    const total = document.getElementById('total-' + id).innerText;
                    const checks = document.getElementById('card-'+id).querySelectorAll('.pay-check:checked:not(:disabled)');
                    if(checks.length === 0) return alert("Pilih item!");
                    const itemIds = Array.from(checks).map(c => c.dataset.id);
                    const rincian = Array.from(checks).map(c => ({ ket: c.dataset.label, hrg: c.dataset.price.replace(/\\./g, '') }));
                    if(confirm("Konfirmasi bayar Rp " + total + "?")) {
                        fetch('/admin/konfirmasi-bayar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ santriId: id, tahun: "${tahunAktif}", itemIds: itemIds }) })
                        .then(res => res.json()).then(d => { if(d.success) tampilkanKwitansi(s.nama, total, rincian, s.whatsapp); });
                    }
                }

                function lihatDetail(id) {
                    const d = DB_SANTRI.find(x => x.id == id);
                    let html = '<div id="detail-view"><div class="text-center mb-3"><img src="/uploads/'+(d.berkas.foto||'')+'" class="rounded shadow" style="width:100px; height:125px; object-fit:cover; border:3px solid #1e4d2b;"></div><h4 class="text-center fw-bold text-success">'+d.nama+'</h4><hr><p class="small"><b>NIK:</b> '+(d.nik||'-')+'<br><b>NISN:</b> '+(d.nisn||'-')+'<br><b>Alamat:</b> '+(d.alamat||'-')+'<br><b>WA:</b> '+d.whatsapp+'</p><div class="d-flex gap-2"><button class="btn btn-warning fw-bold text-white w-100" onclick="modeEdit()">EDIT</button><button class="btn btn-danger fw-bold w-100" onclick="hapusSantri('+id+')">HAPUS</button></div><button class="btn btn-secondary w-100 mt-2" data-bs-dismiss="modal">Tutup</button></div>';
                    html += '<div id="edit-view" style="display:none;"><h5 class="fw-bold mb-3">Edit Data</h5><input id="enama" class="form-control mb-2" value="'+d.nama+'"><input id="enik" class="form-control mb-2" value="'+(d.nik||'')+'"><input id="enisn" class="form-control mb-2" value="'+(d.nisn||'')+'"><input id="ealamat" class="form-control mb-2" value="'+(d.alamat||'')+'"><input id="ewa" class="form-control mb-3" value="'+d.whatsapp+'"><button class="btn btn-success w-100" onclick="simpanEdit('+id+')">Simpan</button><button class="btn btn-light w-100 mt-2" onclick="modeDetail()">Batal</button></div>';
                    document.getElementById('isiM').innerHTML = html;
                    new bootstrap.Modal(document.getElementById('mD')).show();
                }

                function modeEdit() { document.getElementById('detail-view').style.display='none'; document.getElementById('edit-view').style.display='block'; }
                function modeDetail() { document.getElementById('detail-view').style.display='block'; document.getElementById('edit-view').style.display='none'; }
                function simpanEdit(id) {
                    const payload = { id, nama: document.getElementById('enama').value, nik: document.getElementById('enik').value, nisn: document.getElementById('enisn').value, alamat: document.getElementById('ealamat').value, whatsapp: document.getElementById('ewa').value };
                    fetch('/admin/edit-santri', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) }).then(res => res.json()).then(d => { if(d.success) location.reload(); });
                }
                function hapusSantri(id) { if(confirm("Hapus data ini?")) { fetch('/admin/hapus-santri', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id}) }).then(res => res.json()).then(d => { if(d.success) location.reload(); }); } }
                function updateStatus(id, s) { fetch('/admin/update-status', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, status: s}) }).then(res => res.json()).then(d => { if(d.success) location.reload(); }); }
                function simpanC() { 
                    const payload = { tahunAktif: document.getElementById('cfgT').value, biayaA: document.getElementById('cfgA').value, biayaPondok: document.getElementById('cfgP').value, biayaMakan: document.getElementById('cfgM').value };
                    fetch('/admin/update-config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) }).then(res => res.json()).then(d => { if(d.success) location.reload(); }); 
                }
                function kePembayaran(nama) {
                    const tabTrigger = new bootstrap.Tab(document.querySelector('[data-bs-target="#v-bayar"]'));
                    tabTrigger.show();
                    const input = document.getElementById('cari-bayar');
                    input.value = nama; filterT('bayar-row', nama, true);
                }
            </script>
        </body></html>\`);
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log("Server aktif di port: " + PORT); });