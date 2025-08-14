const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static('view'));
app.use('/public', express.static('public'));

// เชื่อม MongoDB
mongoose.connect('mongodb+srv://test:099227@test.jcccez1.mongodb.net/?retryWrites=true&w=majority&appName=test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Schema สำหรับผู้ใช้
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }
});

const User = mongoose.model('User', userSchema);

// ------------------- Register -------------------

// Schema สำหรับคะแนน
const scoreSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});
const Score = mongoose.model('Score', scoreSchema);

// Route สำหรับสมัครสมาชิก
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

        // เข้ารหัสรหัสผ่าน
        const hashedPassword = await bcrypt.hash(password, 10);

        // สร้างผู้ใช้ใหม่
        const newUser = new User({
            username,
            password: hashedPassword,
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

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(400).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });

        // ส่ง userId กลับไป client
        res.json({ success: true, message: 'เข้าสู่ระบบเรียบร้อย', userId: user._id });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});



// Schema สำหรับคำตอบ
const answerSchema = new mongoose.Schema({
    question: String,  // ส่งเป็นประโยคคำถาม
    answer: String,
    timestamp: { type: Date, default: Date.now }
});

const Answer = mongoose.model('Answer', answerSchema);

// Route รับคำตอบ
app.post('/submit-answer', async (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) {
        return res.status(400).json({ success: false, message: 'ต้องส่ง question และ answer' });
    }

    try {
        const newAnswer = new Answer({ question, answer });
        await newAnswer.save();
        res.json({ success: true, message: 'บันทึกคำตอบเรียบร้อย!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// Submit Score
app.post('/submit-score', async (req, res) => {
    const { userId, score } = req.body;

    if (!userId || score == null) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบ' });
    }

    const numericScore = Number(score);
    if (isNaN(numericScore)) {
        return res.status(400).json({ success: false, message: 'คะแนนไม่ถูกต้อง' });
    }

    try {
        const newScore = new Score({
            userId: new mongoose.Types.ObjectId(userId),
            score: numericScore
        });
        await newScore.save();
        res.json({ success: true, message: 'บันทึกคะแนนเรียบร้อย!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// Get latest score
app.get('/get-score/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const scoreData = await Score.findOne({ userId }).sort({ date: -1 });
        if (!scoreData) return res.json({ score: 0 });
        res.json({ score: scoreData.score });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// Schema เก็บข้อมูลผู้ใช้เพิ่มเติม
const profileSchema = new mongoose.Schema({
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

const Profile = mongoose.model('Profile', profileSchema);

// Route บันทึกข้อมูลโปรไฟล์
app.post('/save-profile', async (req, res) => {
    const { name, age, gender } = req.body;

    if (!name || !age || !gender) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
    }

    try {
        const newProfile = new Profile({ name, age, gender });
        await newProfile.save();
        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย!', profileId: newProfile._id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
