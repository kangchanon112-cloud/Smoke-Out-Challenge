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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'view')));
app.use('/public', express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb+srv://test:099227@test.jcccez1.mongodb.net/?retryWrites=true&w=majority&appName=test', {

})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

io.on("connection", (socket) => {
    socket.on("sendSticker-sec1", (msg) => {
        io.emit("receiveSticker-sec1", msg);
    });
    socket.on("sendSticker-part3", (msg) => {
        io.emit("receiveSticker-part3", msg);
    });
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
});

const User = mongoose.model('User', userSchema);

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'กรอกข้อมูลให้ครบ' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
        }

        const newUser = new User({
            username,
            password,
            role: 'user'
        });
        await newUser.save();
        res.json({ success: true, message: 'สมัครสมาชิกเรียบร้อย!', username: newUser.username });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ success: false, message: 'กรอกข้อมูลให้ครบ' });

    try {
        const user = await User.findOne({ username });
        if (!user)
            return res.status(400).json({ success: false, message: 'ผู้ใช้ไม่ถูกต้อง' });

        const isMatch = password === user.password;
        if (!isMatch)
            return res.status(400).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });

        res.json({
            success: true,
            message: 'เข้าสู่ระบบเรียบร้อย',
            username: user.username,
            role: user.role
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const partSchema = new mongoose.Schema({
    part1: { type: Boolean, default: true },
    part2: { type: Boolean, default: true },
    part3: { type: Boolean, default: true },
    part4: { type: Boolean, default: true }
});

const PartStatus = mongoose.model('PartStatus', partSchema);

let partStatus = { part1: true, part2: true, part3: true, part4: true };

async function loadPartStatus() {
    let doc = await PartStatus.findOne();
    if (doc) partStatus = doc.toObject();
    else {
        doc = new PartStatus(partStatus);
        await doc.save();
    }
}
loadPartStatus();

app.get('/admin/get-part-status', (req, res) => {
    res.json(partStatus);
});

app.post('/admin/toggle-part', async (req, res) => {
    try {
        const { part } = req.body;
        if (![1, 2, 3, 4].includes(part)) return res.status(400).json({ success: false });

        partStatus = { part1: false, part2: false, part3: false, part4: false };

        const key = `part${part}`;
        partStatus[key] = true;

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

const answerSchema = new mongoose.Schema({
    username: { type: String, ref: 'User' },
    questionId: { type: String, required: true },
    answer: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

const Answer = mongoose.model('Answer', answerSchema);

app.post('/submit-answer', async (req, res) => {
    const { username, questionId, answer } = req.body;

    if (!username || !questionId || !answer)
        return res.status(400).json({ success: false, message: 'ต้องส่ง username, questionId และ answer' });

    try {
        const newAnswer = new Answer({ username, questionId, answer });
        await newAnswer.save();
        res.json({ success: true, message: 'บันทึกคำตอบเรียบร้อย!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const quizScoreSchema = new mongoose.Schema({
    username: { type: String, required: true },
    quizNumber: { type: Number, required: true },
    score: { type: Number, required: true }
});

quizScoreSchema.index({ username: 1, quizNumber: 1 }, { unique: true });

const QuizScore = mongoose.model("QuizScore", quizScoreSchema);

app.post("/saveScore", async (req, res) => {
    try {
        const { username, quizNumber, score } = req.body;

        const existing = await QuizScore.findOne({ username, quizNumber });

        if (existing) {
            if (score > existing.score) {
                existing.score = score;
                await existing.save();
                return res.json({ message: "อัปเดตคะแนนแล้ว", score: existing.score });
            } else {
                return res.json({ message: "คะแนนเดิมสูงกว่าแล้ว", score: existing.score });
            }
        } else {
            const newScore = new QuizScore({ username, quizNumber, score });
            await newScore.save();
            return res.json({ message: "บันทึกคะแนนใหม่แล้ว", score: newScore.score });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "เกิดข้อผิดพลาด" });
    }
});

const profileSchema = new mongoose.Schema({
    username: { type: String, required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

const Profile = mongoose.model('Profile', profileSchema);

app.post('/save-profile', async (req, res) => {
    const { name, age, gender, username } = req.body;

    if (!name || !age || !gender || !username) {
        return res.status(400).json({ success: false });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
        }

        const newProfile = new Profile({ name, age, gender, username });
        await newProfile.save();

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย!', profileId: newProfile._id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/totalScore/:username", async (req, res) => {
    try {
        const { username } = req.params;

        const result = await QuizScore.aggregate([
            { $match: { username } },
            { $group: { _id: "$username", total: { $sum: "$score" } } }
        ]);

        if (result.length === 0) {
            return res.json({ success: true, username, totalScore: 0 });
        }

        res.json({ success: true, username, totalScore: result[0].total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
});

const feedbackSchema = new mongoose.Schema({
    username: { type: String, required: true },
    rating: { type: Number, required: true },
    feedback: { type: String },
    date: { type: Date, default: Date.now }
});

const Feedback = mongoose.model("Feedback", feedbackSchema);

app.post("/submit-feedback", async (req, res) => {
    const { username, rating, feedback } = req.body;

    if (!username || !rating) {
        return res.status(400).json({ success: false, message: "กรุณาเลือกคะแนนก่อนส่ง" });
    }

    try {
        const newFeedback = new Feedback({ username, rating, feedback });
        await newFeedback.save();
        res.json({ success: true, message: "ส่งข้อเสนอแนะเรียบร้อย!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการส่งข้อมูล" });
    }
});


const messageSchema = new mongoose.Schema({
    username: String,
    question: String,
    message: String,
    timestamp: Date
});

const Message = mongoose.model('Message', messageSchema);

app.post('/save-message', async (req, res) => {
    try {
        const { username, question, message, timestamp } = req.body;
        const newMsg = new Message({ username, question, message, timestamp });
        await newMsg.save();
        res.json({ success: true, message: "บันทึกเรียบร้อย" });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "เกิดข้อผิดพลาด" });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
