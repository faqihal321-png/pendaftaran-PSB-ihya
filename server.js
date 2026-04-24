const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session'); 
const ExcelJS = require('exceljs'); 
const app = express();

// --- CONFIGURATION ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Tambahan agar bisa membaca JSON dari fetch
app.use('/uploads', express.static('uploads'));
app.use('/assets', express.static('assets')); 

app.use(session({
    secret: 'psb-pondok-key-2026', 
    resave: false,
    saveUninitialized: true
}));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const checkAuth = (req, res, next) => {
    if (req.session.isLoggedIn) {
        next();
    } else {
        res.redirect('/login');
    }
};

// --- ROUTES: PUBLIC ---
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/daftar', upload.fields([
    { name: 'ktp' }, { name: 'ijazah' }, { name: 'foto' }, { name: 'kk' }
]), (req, res) => {
    const dataPendaftar = {
        ...req.body,
        berkas: {
            ktp: req.files['ktp'] ? req.files['ktp'][0].path : null,
            ijazah: req.files['ijazah'] ? req.files['ijazah'][0].path : null,
            foto: req.files['foto'] ? req.files['foto'][0].path : null,
            kk: req.files['kk'] ? req.files['kk'][0].path : null
        },
        tanggal: new Date().toLocaleString()
    };

    fs.readFile('database.json', (err, data) => {
        let json = [];
        if (!err && data.length > 0) json = JSON.parse(data);
        json.push(dataPendaftar);
        fs.writeFile('database.json', JSON.stringify(json, null, 2), (err) => {
            if (err) return res.send("Gagal menyimpan data.");
            
            res.send(`
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Pendaftaran Berhasil</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/all.min.css">
                    <style>
                        body { background: #f8fafc; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; }
                        .success-card { background: white; padding: 50px; border-radius: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.05); text-align: center; max-width: 500px; width: 90%; }
                        .check-icon { font-size: 60px; color: #2e7d32; background: #e8f5e9; width: 100px; height: 100px; line-height: 100px; border-radius: 50%; margin: 0 auto 25px; animation: scaleIn 0.5s ease-out; }
                        @keyframes scaleIn { 0% { transform: scale(0); } 100% { transform: scale(1); } }
                        h2 { color: #1e293b; font-weight: 800; margin-bottom: 15px; }
                        p { color: #64748b; margin-bottom: 30px; line-height: 1.6; }
                        .btn-home { background: #2e7d32; color: white; border: none; padding: 12px 35px; border-radius: 12px; font-weight: 600; text-decoration: none; transition: 0.3s; }
                        .btn-home:hover { background: #1b5e20; transform: translateY(-3px); color: white; }
                    </style>
                </head>
                <body>
                    <div class="success-card">
                        <div class="check-icon"><i class="fas fa-check"></i></div>
                        <h2>Pendaftaran Berhasil!</h2>
                        <p>Data santri atas nama <strong>${req.body.nama}</strong> telah kami terima. Mohon tunggu konfirmasi selanjutnya melalui WhatsApp.</p>
                        <a href="/" class="btn btn-home">Kembali ke Beranda</a>
                    </div>
                </body>
                </html>
            `);
        });
    });
});

// --- ROUTE: EXPORT EXCEL ---
app.get('/admin/export', checkAuth, async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Data Pendaftar');

        worksheet.columns = [
            { header: 'No', key: 'no', width: 5 },
            { header: 'Tanggal Daftar', key: 'tanggal', width: 20 },
            { header: 'Nama Lengkap', key: 'nama', width: 25 },
            { header: 'Jenjang', key: 'jenjang', width: 15 },
            { header: 'NISN', key: 'nisn', width: 15 },
            { header: 'NIK', key: 'nik', width: 20 },
            { header: 'Alamat', key: 'alamat', width: 35 },
            { header: 'WhatsApp', key: 'whatsapp', width: 18 },
            { header: 'Nama Ayah', key: 'namaAyah', width: 20 },
            { header: 'Pekerjaan Ayah', key: 'kerjaAyah', width: 20 },
            { header: 'Nama Ibu', key: 'namaIbu', width: 20 },
            { header: 'Pekerjaan Ibu', key: 'kerjaI Ibu', width: 20 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E7D32' } };

        if (!fs.existsSync('database.json')) return res.send("Data belum tersedia.");
        const data = fs.readFileSync('database.json');
        const pendaftar = JSON.parse(data);

        pendaftar.forEach((p, index) => {
            const row = worksheet.addRow({
                no: index + 1,
                tanggal: p.tanggal || '-',
                nama: p.nama || '-',
                jenjang: p.jenjang || '-',
                nisn: p.nisn || '-',
                nik: p.nik || '-',
                alamat: p.alamat || '-',
                whatsapp: p.whatsapp || '-',
                namaAyah: p.namaAyah || '-',
                kerjaAyah: p.kerjaAyah || '-',
                namaIbu: p.namaIbu || '-',
                kerjaIbu: p.kerjaIbu || '-'
            });
            row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Data_Pendaftar_PSB_Lengkap.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) { res.status(500).send("Gagal ekspor: " + e.message); }
});

// --- ROUTE: KOSONGKAN DATA (TAMBAHAN BARU) ---
app.post('/admin/kosongkan', checkAuth, (req, res) => {
    fs.writeFile('database.json', JSON.stringify([], null, 2), (err) => {
        if (err) return res.json({ success: false, message: "Gagal mengosongkan data." });
        res.json({ success: true, message: "Semua data pendaftaran telah berhasil dihapus!" });
    });
});

// --- ROUTES: AUTHENTICATION ---
app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login Admin - PSB</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #f1f5f9; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; }
            .login-card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 100%; max-width: 400px; }
            .btn-success { background: #2e7d32; border: none; border-radius: 10px; padding: 12px; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="login-card text-center">
            <h4 class="fw-bold mb-4">Admin Login</h4>
            <form action="/login" method="POST">
                <input type="text" name="user" class="form-control mb-3" required placeholder="Username">
                <input type="password" name="pass" class="form-control mb-4" required placeholder="Password">
                <button type="submit" class="btn btn-success w-100">Masuk Sekarang</button>
            </form>
        </div>
    </body>
    </html>
    `);
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === 'admin' && pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else {
        res.send("<script>alert('Username atau Password Salah!'); window.location='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- ROUTES: ADMIN ---
app.get('/admin', checkAuth, (req, res) => {
    fs.readFile('database.json', (err, data) => {
        let pendaftar = [];
        if (!err && data.length > 0) pendaftar = JSON.parse(data);

        let html = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Panel - PSB Pondok</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/all.min.css">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
                body { background-color: #f8fafc; font-family: 'Inter', sans-serif; color: #334155; }
                
                /* Navbar */
                .navbar-custom { background: linear-gradient(135deg, #1e4d2b, #2e7d32); padding: 15px 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; min-height: 100px; position: relative; }
                .nav-logout-left { position: absolute; left: 40px; }
                .nav-kop-right { position: absolute; right: 40px; display: flex; align-items: center; color: white; }
                
                /* Desktop Table Style */
                .main-card { border: none; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); background: white; padding: 25px; }
                .foto-circle { width: 50px; height: 50px; object-fit: cover; border-radius: 12px; }
                .modal-info-box { background-color: #f8fafc; border-radius: 12px; padding: 12px; margin-bottom: 10px; border: 1px solid #f1f5f9; }
                .label-custom { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; display: block; }
                .data-value { font-weight: 600; color: #1e293b; }

                /* Mobile Card Layout (Disembunyikan di Desktop) */
                .mobile-card-container { display: none; }

                @media (max-width: 768px) {
                    .navbar-custom { padding: 15px; flex-direction: column; min-height: auto; gap: 10px; }
                    .nav-logout-left, .nav-kop-right { position: static; margin-bottom: 5px; }
                    .table-responsive { display: none; } /* Sembunyikan tabel di HP */
                    .mobile-card-container { display: block; } /* Munculkan Card di HP */
                    
                    .card-santri-mobile { 
                        background: white; border-radius: 20px; padding: 15px; margin-bottom: 15px; 
                        box-shadow: 0 5px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;
                    }
                    .header-mobile { display: flex; align-items: center; margin-bottom: 12px; }
                    .foto-mobile { width: 60px; height: 60px; border-radius: 12px; object-fit: cover; margin-right: 12px; }
                    .info-grid-mobile { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                    .btn-group-mobile { display: flex; gap: 8px; margin-top: 12px; }
                    .btn-mobile { flex: 1; border-radius: 10px; font-weight: 600; font-size: 0.85rem; padding: 10px; }
                }
            </style>
        </head>
        <body>
            <nav class="navbar-custom mb-4 text-white text-center">
                <div class="nav-logout-left"><a href="/logout" class="btn btn-outline-light btn-sm rounded-pill px-3">Keluar</a></div>
                <div><h4 class="mb-0 fw-bold">DASHBOARD ADMIN PSB</h4><small>Manajemen Data Santri Baru</small></div>
                <div class="nav-kop-right"><div class="text-end small fw-bold">PONDOK PESANTREN<br>AL-FAQIH</div></div>
            </nav>

            <div class="container">
                <div class="card main-card">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h6 class="fw-bold mb-0">Total: <span class="badge bg-success">${pendaftar.length} Orang</span></h6>
                        <div class="d-flex gap-2">
                            <button onclick="location.reload()" class="btn btn-light btn-sm border rounded-pill px-3"><i class="fas fa-sync-alt me-1"></i> Refresh</button>
                            <button onclick="kosongkanData()" class="btn btn-danger btn-sm rounded-pill px-3"><i class="fas fa-trash-alt me-1"></i> Kosongkan</button>
                            <a href="/admin/export" class="btn btn-success btn-sm px-3 rounded-pill"><i class="fas fa-file-excel me-1"></i> Export Excel</a>
                        </div>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead class="table-light">
                                <tr><th>No</th><th>Santri</th><th>NISN / NIK</th><th>Jenjang</th><th class="text-end">Aksi</th></tr>
                            </thead>
                            <tbody>`;

            pendaftar.forEach((p, index) => {
                const b = p.berkas || {};
                const modalId = `modal${index}`;
                
                // Tambahkan baris tabel untuk Desktop
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>
                            <div class="d-flex align-items-center">
                                <img src="/${b.foto}" class="foto-circle me-3">
                                <div><div class="fw-bold">${p.nama}</div><small class="text-muted">${p.whatsapp}</small></div>
                            </div>
                        </td>
                        <td><small>NISN: ${p.nisn}<br>NIK: ${p.nik}</small></td>
                        <td><span class="badge bg-success-subtle text-success">${p.jenjang}</span></td>
                        <td class="text-end">
                            <button class="btn btn-light btn-sm rounded-pill border px-3" data-bs-toggle="modal" data-bs-target="#${modalId}">Detail</button>
                        </td>
                    </tr>`;
            });

            html += `
                            </tbody>
                        </table>
                    </div>

                    <div class="mobile-card-container">`;

            pendaftar.forEach((p, index) => {
                const b = p.berkas || {};
                const modalId = `modal${index}`;
                
                html += `
                    <div class="card-santri-mobile">
                        <div class="header-mobile">
                            <img src="/${b.foto}" class="foto-mobile shadow-sm">
                            <div>
                                <h6 class="fw-bold mb-0">${p.nama}</h6>
                                <span class="badge bg-success-subtle text-success small" style="font-size:0.6rem">${p.jenjang}</span>
                            </div>
                        </div>
                        <div class="info-grid-mobile">
                            <div class="modal-info-box m-0"><span class="label-custom">NISN</span><span class="data-value small">${p.nisn}</span></div>
                            <div class="modal-info-box m-0"><span class="label-custom">NIK</span><span class="data-value small">${p.nik}</span></div>
                        </div>
                        <div class="btn-group-mobile">
                            <a href="https://wa.me/${p.whatsapp}" target="_blank" class="btn btn-success btn-mobile text-decoration-none text-center">
                                <i class="fab fa-whatsapp me-1"></i> WhatsApp
                            </a>
                            <button class="btn btn-light btn-mobile border" data-bs-toggle="modal" data-bs-target="#${modalId}">
                                <i class="fas fa-eye me-1"></i> Detail
                            </button>
                        </div>
                    </div>`;
            });

            html += `
                    </div>
                </div>
            </div>

            ${pendaftar.map((p, index) => {
                const b = p.berkas || {};
                return `
                <div class="modal fade" id="modal${index}" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content border-0" style="border-radius: 25px;">
                            <div class="modal-header border-0 pb-0"><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                            <div class="modal-body p-4">
                                <div class="row">
                                    <div class="col-md-4 text-center mb-3 mb-md-0">
                                        <img src="/${b.foto}" class="img-fluid rounded shadow-sm mb-3" style="max-height: 200px; width: 100%; object-fit: cover; border-radius: 20px !important;">
                                        <h5 class="fw-bold">${p.nama}</h5>
                                        <a href="https://wa.me/${p.whatsapp}" target="_blank" class="btn btn-success btn-sm w-100 rounded-pill">Hubungi Santri</a>
                                    </div>
                                    <div class="col-md-8">
                                        <div class="row g-2">
                                            <div class="col-6"><div class="modal-info-box"><span class="label-custom">NISN</span><span class="data-value">${p.nisn}</span></div></div>
                                            <div class="col-6"><div class="modal-info-box"><span class="label-custom">NIK</span><span class="data-value">${p.nik}</span></div></div>
                                            <div class="col-12"><div class="modal-info-box"><span class="label-custom">Alamat</span><span class="data-value small">${p.alamat}</span></div></div>
                                            <div class="col-6"><div class="modal-info-box"><span class="label-custom">Ayah</span><span class="data-value">${p.namaAyah} (${p.kerjaAyah})</span></div></div>
                                            <div class="col-6"><div class="modal-info-box"><span class="label-custom">Ibu</span><span class="data-value">${p.namaIbu} (${p.kerjaIbu})</span></div></div>
                                        </div>
                                        <div class="mt-3 d-flex gap-2">
                                            <a href="/${b.ktp}" target="_blank" class="btn btn-outline-secondary btn-sm flex-grow-1 rounded-pill">KTP</a>
                                            <a href="/${b.kk}" target="_blank" class="btn btn-outline-secondary btn-sm flex-grow-1 rounded-pill">KK</a>
                                            <a href="/${b.ijazah}" target="_blank" class="btn btn-outline-secondary btn-sm flex-grow-1 rounded-pill">Ijazah</a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('')}

            <script>
                function kosongkanData() {
                    if (confirm("PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA data pendaftar? Tindakan ini tidak bisa dibatalkan.")) {
                        fetch('/admin/kosongkan', { method: 'POST' })
                        .then(res => res.json())
                        .then(data => {
                            if(data.success) {
                                alert(data.message);
                                location.reload();
                            } else {
                                alert("Gagal: " + data.message);
                            }
                        });
                    }
                }
            </script>
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
        </body>
        </html>`;
        res.send(html);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});