const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session'); // Tambahan untuk login
const ExcelJS = require('exceljs'); // Tambahan untuk Export Excel
const app = express();

// --- CONFIGURATION ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use('/assets', express.static('assets')); 

app.use(session({
    secret: 'psb-pondok-key-2026', // Kunci enkripsi session
    resave: false,
    saveUninitialized: true
}));

// Folder Uploads
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Multer Storage
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- MIDDLEWARE CEK LOGIN ---
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
            
            // Tampilan Sukses Baru yang Menarik & Simple
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
                        <div class="check-icon">
                            <i class="fas fa-check"></i>
                        </div>
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

// --- ROUTE: EXPORT EXCEL (TERBARU DENGAN KOLOM PEKERJAAN) ---
app.get('/admin/export', checkAuth, async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Data Pendaftar');

        // 1. Definisi Kolom (Termasuk Pekerjaan Orang Tua)
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
            { header: 'Pekerjaan Ayah', key: 'kerjaAyah', width: 20 }, // Penambahan Kolom Pekerjaan
            { header: 'Nama Ibu', key: 'namaIbu', width: 20 },
            { header: 'Pekerjaan Ibu', key: 'kerjaIbu', width: 20 }    // Penambahan Kolom Pekerjaan
        ];

        // 2. Styling Header (Hijau Pondok)
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = { 
            type: 'pattern', 
            pattern: 'solid', 
            fgColor: { argb: '2E7D32' } 
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // 3. Ambil Data dari database.json
        if (!fs.existsSync('database.json')) {
            return res.send("Data belum tersedia.");
        }
        
        const data = fs.readFileSync('database.json');
        const pendaftar = JSON.parse(data);

        // 4. Masukkan Data ke Baris Excel
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
                kerjaAyah: p.kerjaAyah || '-', // Mengambil data kerjaAyah
                namaIbu: p.namaIbu || '-',
                kerjaIbu: p.kerjaIbu || '-'    // Mengambil data kerjaIbu
            });

            // Memberikan Border agar rapi (Kotak-kotak)
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle' };
            });
        });

        // 5. Kirim File ke Browser
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Data_Pendaftar_PSB_Lengkap.xlsx');
        
        await workbook.xlsx.write(res);
        res.end();

    } catch (e) {
        console.error("Error Export:", e);
        res.status(500).send("Gagal ekspor: " + e.message);
    }
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
            .form-control { border-radius: 10px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
        </style>
    </head>
    <body>
        <div class="login-card">
            <div class="text-center mb-4">
                <div class="bg-success text-white rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style="width:60px; height:60px;">
                    <i class="fas fa-lock" style="font-size: 24px;"></i>
                </div>
                <h4 class="fw-bold">Admin Login</h4>
                <p class="text-muted small">Masukkan kredensial untuk akses dashboard</p>
            </div>
            <form action="/login" method="POST">
                <div class="mb-3">
                    <label class="form-label small fw-bold">Username</label>
                    <input type="text" name="user" class="form-control" required placeholder="admin">
                </div>
                <div class="mb-4">
                    <label class="form-label small fw-bold">Password</label>
                    <input type="password" name="pass" class="form-control" required placeholder="••••••••">
                </div>
                <button type="submit" class="btn btn-success w-100">Masuk Sekarang</button>
            </form>
        </div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/js/all.min.js"></script>
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

// --- ROUTES: ADMIN (PROTECTED BY CHECKAUTH) ---
app.get('/admin', checkAuth, (req, res) => {
    fs.readFile('database.json', (err, data) => {
        if (err || data.length === 0) {
            return res.send("<h2>Belum ada data pendaftar.</h2><a href='/'>Kembali</a>");
        }

        try {
            const pendaftar = JSON.parse(data);
            
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
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap');
                    body { background-color: #f8fafc; font-family: 'Inter', sans-serif; color: #334155; }
                    
                    .navbar-custom { 
                        background: linear-gradient(135deg, #1e4d2b, #2e7d32); 
                        padding: 15px 40px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        position: relative;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100px;
                    }
                    .nav-title-center {
                        text-align: center;
                        color: white;
                    }
                    .nav-kop-right {
                        position: absolute;
                        right: 40px;
                        display: flex;
                        align-items: center;
                        background: rgba(255,255,255,0.1);
                        padding: 8px 15px;
                        border-radius: 12px;
                        border: 1px solid rgba(255,255,255,0.2);
                        color: white;
                    }
                    .nav-logout-left {
                        position: absolute;
                        left: 40px;
                    }

                    .main-card { border: none; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); background: white; }
                    .table thead th { background-color: #f1f5f9; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; color: #64748b; padding: 15px; border: none; }
                    .foto-circle { width: 50px; height: 50px; object-fit: cover; border-radius: 12px; border: 2px solid #e2e8f0; }
                    .btn-detail { background-color: #f1f5f9; color: #1e293b; border: none; font-weight: 600; transition: all 0.2s; }
                    .btn-detail:hover { background-color: #2e7d32; color: white; transform: translateY(-2px); }
                    .modal-content { border: none; border-radius: 24px; overflow: hidden; }
                    .modal-info-box { background-color: #f8fafc; border-radius: 16px; padding: 15px; border: 1px solid #f1f5f9; }
                    .label-custom { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; display: block; }
                    .data-value { font-weight: 600; color: #1e293b; }
                    
                    /* Styling Button Export */
                    .btn-export-excel { background-color: #1e4d2b; color: white; border: none; font-weight: 600; transition: all 0.2s; }
                    .btn-export-excel:hover { background-color: #2e7d32; color: white; transform: scale(1.05); }
                </style>
            </head>
            <body>

            <nav class="navbar-custom mb-4">
                <div class="nav-logout-left">
                    <a href="/logout" class="btn btn-outline-light btn-sm rounded-pill px-3 fw-bold">
                        <i class="fas fa-sign-out-alt me-1"></i> Keluar
                    </a>
                </div>

                <div class="nav-title-center">
                    <h4 class="mb-0 fw-bold text-uppercase" style="letter-spacing: 1px;">Dashboard Admin PSB</h4>
                    <small class="opacity-75">Manajemen Data Santri Baru</small>
                </div>

                <div class="nav-kop-right">
                    <img src="https://cdn-icons-png.flaticon.com/512/2641/2641322.png" alt="Logo" style="width: 35px; height: 35px; margin-right: 10px; filter: brightness(0) invert(1);">
                    <div style="line-height: 1.1; text-align: left;">
                        <div style="font-size: 0.7rem; font-weight: 600; opacity: 0.9;">PONDOK PESANTREN</div>
                        <div style="font-size: 0.9rem; font-weight: 800;">AL-FAQIH</div>
                    </div>
                </div>
            </nav>

            <div class="container">
                <div class="card main-card p-4">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h6 class="fw-bold mb-0">Daftar Santri Baru <span class="badge bg-success-subtle text-success rounded-pill ms-2">${pendaftar.length} Orang</span></h6>
                        <a href="/admin/export" class="btn btn-export-excel btn-sm px-3 rounded-pill shadow-sm">
                           <i class="fas fa-file-excel me-2"></i> Export Ke Excel
                        </a>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>Santri</th>
                                    <th>NISN / NIK</th>
                                    <th>Jenjang</th>
                                    <th class="text-end">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>`;

            pendaftar.forEach((p, index) => {
                const b = p.berkas || {};
                const modalId = `modal${index}`;

                html += `
                    <tr>
                        <td><span class="text-muted small">${index + 1}</span></td>
                        <td>
                            <div class="d-flex align-items-center">
                                <img src="/${b.foto}" class="foto-circle me-3">
                                <div>
                                    <div class="fw-bold text-dark">${p.nama}</div>
                                    <div class="small text-muted">${p.whatsapp}</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="small fw-600">${p.nisn}</div>
                            <div class="small text-muted" style="font-size: 0.7rem;">NIK: ${p.nik}</div>
                        </td>
                        <td><span class="badge bg-success-subtle text-success px-3 border border-success-subtle">${p.jenjang}</span></td>
                        <td class="text-end">
                            <button class="btn btn-detail btn-sm px-3 rounded-pill" data-bs-toggle="modal" data-bs-target="#${modalId}">
                                Detail
                            </button>
                        </td>
                    </tr>

                    <div class="modal fade" id="${modalId}" tabindex="-1">
                        <div class="modal-dialog modal-lg modal-dialog-centered">
                            <div class="modal-content shadow-lg">
                                <div class="modal-body p-0">
                                    <div class="row g-0">
                                        <div class="col-md-4 p-4 text-center" style="background-color: #f8fafc; border-right: 1px solid #f1f5f9;">
                                            <img src="/${b.foto}" class="img-fluid shadow-sm mb-3" style="border-radius: 20px; border: 5px solid white;">
                                            <h5 class="fw-bold mb-1">${p.nama}</h5>
                                            <span class="badge bg-success mb-3">${p.jenjang}</span>
                                            <div class="d-grid gap-2">
                                                <a href="https://wa.me/${p.whatsapp}" target="_blank" class="btn btn-success btn-sm rounded-pill">
                                                    <i class="fab fa-whatsapp me-2"></i>Hubungi Santri
                                                </a>
                                            </div>
                                        </div>
                                        <div class="col-md-8 p-4">
                                            <div class="d-flex justify-content-between mb-3">
                                                <h6 class="fw-bold text-success"><i class="fas fa-info-circle me-2"></i>Informasi Lengkap</h6>
                                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                            </div>
                                            <div class="row g-3">
                                                <div class="col-6"><div class="modal-info-box"><span class="label-custom">NISN</span><span class="data-value">${p.nisn}</span></div></div>
                                                <div class="col-6"><div class="modal-info-box"><span class="label-custom">NIK</span><span class="data-value">${p.nik}</span></div></div>
                                                <div class="col-12"><div class="modal-info-box"><span class="label-custom">Alamat Lengkap</span><span class="data-value small">${p.alamat}</span></div></div>
                                                <div class="col-6 small"><span class="label-custom">Nama Ayah</span><span class="data-value">${p.namaAyah} (${p.kerjaAyah})</span></div>
                                                <div class="col-6 small"><span class="label-custom">Nama Ibu</span><span class="data-value">${p.namaIbu} (${p.kerjaIbu})</span></div>
                                            </div>
                                            <h6 class="fw-bold text-success mt-4 mb-3"><i class="fas fa-paperclip me-2"></i>Dokumen Terlampir</h6>
                                            <div class="d-flex gap-2">
                                                <a href="/${b.ktp}" target="_blank" class="btn btn-light border btn-sm flex-grow-1 rounded-pill">KTP</a>
                                                <a href="/${b.ijazah}" target="_blank" class="btn btn-light border btn-sm flex-grow-1 rounded-pill">Ijazah</a>
                                                <a href="/${b.kk}" target="_blank" class="btn btn-light border btn-sm flex-grow-1 rounded-pill">KK</a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            </body>
            </html>`;
            
            res.send(html);
        } catch (e) {
            res.send("Terjadi kesalahan: " + e.message);
        }
    });
});

app.listen(3000, () => console.log('Server running: http://localhost:3000'));