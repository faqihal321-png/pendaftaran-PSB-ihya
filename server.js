const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const ExcelJS = require('exceljs');

const app = express();
const DATA_FILE = './database.json';

const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, '[]'); return []; }
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        return content ? JSON.parse(content) : [];
    } catch (e) { return []; }
};

const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({ secret: 'psb-2026', resave: false, saveUninitialized: true }));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const upload = multer({ storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/daftar', upload.fields([{name:'ktp'}, {name:'ijazah'}, {name:'foto'}, {name:'kk'}]), (req, res) => {
    try {
        const data = readData();
        const baru = {
            id: Date.now(),
            ...req.body,
            berkas: {
                ktp: req.files['ktp'] ? req.files['ktp'][0].filename : null,
                foto: req.files['foto'] ? req.files['foto'][0].filename : null
            },
            tanggal: new Date().toLocaleString("id-ID")
        };
        data.push(baru);
        saveData(data);
        res.send("<h2>✅ Berhasil!</h2><a href='/'>Kembali</a>");
    } catch (e) { res.status(500).send("Error: " + e.message); }
});

app.get('/login', (req, res) => {
    res.send('<form action="/login" method="POST"><input name="user"><input name="pass" type="password"><button>Login</button></form>');
});

app.post('/login', (req, res) => {
    if(req.body.user === 'admin' && req.body.pass === 'pondok123') {
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    } else { res.send("Gagal"); }
});

app.get('/admin', (req, res) => {
    if(!req.session.isLoggedIn) return res.redirect('/login');
    res.send(`<h1>Admin</h1><pre>${JSON.stringify(readData(), null, 2)}</pre>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Run on ${PORT}`));