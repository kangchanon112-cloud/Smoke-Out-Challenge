import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middlewares
app.use(cors());
app.use(express.json()); // ต้องอยู่ก่อน route
app.use(express.static(path.join(__dirname, 'view')));
app.use('/public', express.static(path.join(__dirname, 'public')));


// เชื่อม MongoDB
mongoose.connect('mongodb+srv://test:099227@test.jcccez1.mongodb.net/?retryWrites=true&w=majority&appName=test', {

})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));


io.on('connection', (socket) => {
    console.log('ผู้ใช้เชื่อมต่อแล้ว');

    socket.on('sendSticker', (sticker) => {
        io.emit('receiveSticker', sticker);
    });

    socket.on('disconnect', () => {
        console.log('ผู้ใช้ออกจากเว็บ');
    });
});


// Schema สำหรับผู้ใช้
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    bestScore: { type: Number, default: 0 }  // ✅ เพิ่มตรงนี้
});


const User = mongoose.model('User', userSchema);



//
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'กรอกข้อมูลให้ครบ' });
    }

    try {
        // ตรวจสอบ username ซ้ำ
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
        }

        // สร้างผู้ใช้ใหม่ (เก็บ password เป็น plaintext)
        const newUser = new User({
            username,
            password, // ไม่เข้ารหัส
            role: 'user'
        });
        await newUser.save();

        // สร้างคะแนนเริ่มต้นใน DB พร้อม userId
        const newScore = new Score({
            userId: newUser._id,
            score: 0
        });
        await newScore.save();

        // ส่ง userId กลับ client
        res.json({ success: true, message: 'สมัครสมาชิกเรียบร้อย!', userId: newUser._id });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// ------------------- Login -------------------
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ success: false, message: 'กรอกข้อมูลให้ครบ' });

    try {
        const user = await User.findOne({ username });
        if (!user)
            return res.status(400).json({ success: false, message: 'ผู้ใช้ไม่ถูกต้อง' });

        const isMatch = password === user.password; // ถ้าต้องเข้ารหัส ให้ใช้ bcrypt.compare
        if (!isMatch)
            return res.status(400).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });

        // ส่ง role กลับด้วย
        res.json({
            success: true,
            message: 'เข้าสู่ระบบเรียบร้อย',
            userID: user._id,
            role: user.role  // <-- เพิ่มตรงนี้
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// backend.js (server)
// ตัวอย่าง server.js
// Schema สำหรับเก็บสถานะ part
// กำหนดค่าเริ่มต้น
// ====================== Part Status ======================
// Schema สำหรับเก็บสถานะ part
const partSchema = new mongoose.Schema({
    part1: { type: Boolean, default: true },
    part2: { type: Boolean, default: true },
    part3: { type: Boolean, default: true },
    part4: { type: Boolean, default: true }
});

// Model
const PartStatus = mongoose.model('PartStatus', partSchema);

// กำหนดค่าเริ่มต้น
let partStatus = { part1: true, part2: true, part3: true, part4: true };

// โหลดสถานะจาก DB ตอน server start
async function loadPartStatus() {
    let doc = await PartStatus.findOne();
    if (doc) partStatus = doc.toObject();
    else {
        doc = new PartStatus(partStatus);
        await doc.save();
    }
}
loadPartStatus();

// GET สถานะ part
app.get('/admin/get-part-status', (req, res) => {
    res.json(partStatus);
});

// POST toggle part
app.post('/admin/toggle-part', async (req, res) => {
    try {
        const { part } = req.body;
        if (![1, 2, 3, 4].includes(part)) return res.status(400).json({ success: false });

        // ตั้งทุก part เป็น false
        partStatus = { part1: false, part2: false, part3: false, part4: false };

        // เปิดเฉพาะ part ที่เลือก
        const key = `part${part}`;
        partStatus[key] = true;

        // อัปเดตใน DB
        let doc = await PartStatus.findOne();
        if (!doc) {
            doc = new PartStatus(partStatus);
        } else {
            doc.part1 = partStatus.part1;
            doc.part2 = partStatus.part2;
            doc.part3 = partStatus.part3;
            doc.part4 = partStatus.part4;
        }
        await doc.save();

        res.json({ success: true, part: key, status: partStatus[key] });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});



// Schema สำหรับเก็บคำตอบ
const answerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    questionId: { type: String, required: true }, // เปลี่ยนจาก question เป็น questionId
    answer: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

// สร้าง Model
const Answer = mongoose.model('Answer', answerSchema);

app.post('/submit-answer', async (req, res) => {
    const { userID, questionId, answer } = req.body;

    if (!userID || !questionId || !answer)
        return res.status(400).json({ success: false, message: 'ต้องส่ง userID, questionId และ answer' });

    try {
        const newAnswer = new Answer({ userId: userID, questionId, answer });
        await newAnswer.save();
        res.json({ success: true, message: 'บันทึกคำตอบเรียบร้อย!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


const quizScoreSchema = new mongoose.Schema({
    userID: { type: String, required: true },
    quizNumber: { type: Number, required: true },
    score: { type: Number, required: true }
});

// unique index ป้องกันซ้ำ
quizScoreSchema.index({ userID: 1, quizNumber: 1 }, { unique: true });

const QuizScore = mongoose.model("QuizScore", quizScoreSchema);

// API: บันทึกคะแนน
app.post("/saveScore", async (req, res) => {
    try {
        const { userID, quizNumber, score } = req.body;

        // หา record เดิม
        const existing = await QuizScore.findOne({ userID, quizNumber });

        if (existing) {
            if (score > existing.score) {
                existing.score = score;
                await existing.save();
                return res.json({ message: "อัปเดตคะแนนแล้ว", score: existing.score });
            } else {
                return res.json({ message: "คะแนนเดิมสูงกว่าแล้ว", score: existing.score });
            }
        } else {
            const newScore = new QuizScore({ userID, quizNumber, score });
            await newScore.save();
            return res.json({ message: "บันทึกคะแนนใหม่แล้ว", score: newScore.score });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "เกิดข้อผิดพลาด" });
    }
});





// Schema เก็บข้อมูลผู้ใช้เพิ่มเติม
const profileSchema = new mongoose.Schema({
    userID: { type: String, required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

const Profile = mongoose.model('Profile', profileSchema);

// Route บันทึกข้อมูลโปรไฟล์
app.post('/save-profile', async (req, res) => {
    const { name, age, gender, userID } = req.body;

    if (!name || !age || !gender || !userID) {
        return res.status(400).json({ success: false });
    }

    try {
        // ตรวจสอบ userId ก่อน
        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
        }

        // สร้าง profile พร้อมเชื่อม user
        const newProfile = new Profile({ name, age, gender, userID });
        await newProfile.save();

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย!', profileId: newProfile._id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API: รวมคะแนนทั้งหมดของ userID
app.get("/totalScore/:userID", async (req, res) => {
    try {
        const { userID } = req.params;

        const result = await QuizScore.aggregate([
            { $match: { userID } },                // เลือกเฉพาะ userID
            { $group: { _id: "$userID", total: { $sum: "$score" } } } // รวมคะแนน
        ]);

        if (result.length === 0) {
            return res.json({ success: true, userID, totalScore: 0 });
        }

        res.json({ success: true, userID, totalScore: result[0].total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'index.html'));
});
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'index.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'login.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'admin.html'));
});
app.get('/part1', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'part1.html'));
});
app.get('/part2', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'part2.html'));
});
app.get('/part3', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'part3.html'));
});
app.get('/part4', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'part4.html'));
});
app.get('/quiz', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'quiz.html'));
});
app.get('/quiz2', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'quiz2.html'));
});
app.get('/quiz3', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'quiz3.html'));
});
app.get('/quiz4', (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'quiz4.html'));
});


const PORT = process.env.PORT || 3000; // ใช้ port ของ Render หรือ fallback เป็น 3000
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
