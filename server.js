/**
 * PrekClip Server (Единый деплой, Render Ready)
 * Backend: Node.js + Express + JSON DB
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000; 
const DB_FILE = path.join(__dirname, 'database.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// --- НАСТРОЙКИ CORS И MIDDLEWARE ---
app.use(cors()); 
app.use(bodyParser.json());

// 1. Статическая раздача загруженных файлов (Медиа)
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
app.use('/uploads', express.static(UPLOAD_DIR)); 

// --- НАСТРОЙКА ХРАНИЛИЩА ФАЙЛОВ (MULTER) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage }); // 🔥 Инициализация multer

// --- ФУНКЦИИ РАБОТЫ С БД ---
const getDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        return { users: [], posts: [] };
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- ИНИЦИАЛИЗАЦИЯ (Включая официальный аккаунт) ---
const initializeDB = () => {
    const db = getDB();
    const officialUsername = 'PrekCompany';
    const officialPassword = 'PrekCompanyCOPYRIGHT777';
    
    if (!db.users.find(u => u.username === officialUsername)) {
        const officialUser = {
            id: 'official_1',
            username: officialUsername,
            password: officialPassword,
            avatar: null,
            followers: [],
            following: [],
            isVerified: true 
        };
        db.users.push(officialUser);
        saveDB(db); // Сохраняем сразу после создания
        console.log(`✅ Официальный аккаунт "${officialUsername}" создан.`);
    }
};
initializeDB(); 

// --- API ROUTES ---

// 1. Авторизация
app.post('/auth/register', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    
    if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const newUser = {
        id: 'user_' + Date.now(),
        username,
        password, 
        avatar: null,
        followers: [],
        following: [],
        isVerified: false 
    };

    db.users.push(newUser);
    saveDB(db);
    res.json({ success: true, user: newUser });
});

app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    // Ищем точное совпадение по имени и паролю
    const user = db.users.find(u => u.username === username && u.password === password);
    
    if (!user) return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    
    // Возвращаем данные пользователя, кроме пароля
    const { password: userPassword, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// 2. Посты и Лента
app.post('/posts/create', upload.single('file'), (req, res) => {
    const { userId, caption, type } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });

    const db = getDB();
    const newPost = {
        id: 'post_' + Date.now(),
        userId,
        type, 
        src: '/uploads/' + req.file.filename,
        caption,
        likes: [],
        comments: [],
        timestamp: Date.now()
    };

    db.posts.unshift(newPost);
    saveDB(db);
    res.json(newPost);
});

app.get('/posts/feed', (req, res) => {
    const db = getDB();
    const feed = db.posts.map(post => {
        const author = db.users.find(u => u.id === post.userId);
        return {
            ...post,
            authorName: author ? author.username : 'Unknown',
            authorAvatar: author ? author.avatar : null,
            authorVerified: author ? author.isVerified : false 
        };
    });
    res.json(feed);
});

// 3. Действия (Лайк, Коммент, Подписка)
app.post('/action/like', (req, res) => {
    const { postId, userId } = req.body;
    const db = getDB();
    const post = db.posts.find(p => p.id === postId);

    if (post) {
        const idx = post.likes.indexOf(userId);
        if (idx === -1) post.likes.push(userId);
        else post.likes.splice(idx, 1);
        saveDB(db);
        res.json({ likesCount: post.likes.length, isLiked: idx === -1 });
    } else {
        res.status(404).json({ error: 'Пост не найден' });
    }
});

app.post('/action/comment', (req, res) => {
    const { postId, userId, text } = req.body;
    const db = getDB();
    const post = db.posts.find(p => p.id === postId);
    const user = db.users.find(u => u.id === userId);

    if (post && user) {
        const comment = {
            id: 'cmt_' + Date.now(),
            username: user.username,
            avatar: user.avatar,
            text,
            timestamp: Date.now(),
            isVerified: user.isVerified 
        };
        post.comments.push(comment);
        saveDB(db);
        res.json(comment);
    } else {
        res.status(400).json({ error: 'Ошибка комментирования' });
    }
});

app.post('/action/follow', (req, res) => {
    const { currentId, targetId } = req.body;
    if (currentId === targetId) return res.status(400).json({ error: 'Нельзя подписаться на себя' });

    const db = getDB();
    const me = db.users.find(u => u.id === currentId);
    const target = db.users.find(u => u.id === targetId);

    if (me && target) {
        const idx = me.following.indexOf(targetId);
        let isFollowing = false;

        if (idx === -1) {
            me.following.push(targetId);
            target.followers.push(currentId);
            isFollowing = true;
        } else {
            me.following.splice(idx, 1);
            const tIdx = target.followers.indexOf(currentId);
            if (tIdx !== -1) target.followers.splice(tIdx, 1);
        }
        saveDB(db);
        res.json({ isFollowing, followersCount: target.followers.length });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

// 4. Профиль и Поиск
app.get('/users/search', (req, res) => {
    const q = req.query.q.toLowerCase();
    const db = getDB();
    const result = db.users
        .filter(u => u.username.toLowerCase().includes(q))
        .map(u => ({ id: u.id, username: u.username, avatar: u.avatar, isVerified: u.isVerified }));
    res.json(result);
});

app.get('/users/:id', (req, res) => {
    const db = getDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userPosts = db.posts.filter(p => p.userId === user.id);
    const { password, ...safeUser } = user;
    res.json({ user: safeUser, posts: userPosts });
});

app.post('/users/avatar', upload.single('file'), (req, res) => {
    const { userId } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (user && req.file) {
        user.avatar = '/uploads/' + req.file.filename;
        saveDB(db);
        res.json({ url: user.avatar });
    } else {
        res.status(400).json({ error: 'Ошибка' });
    }
});

// 5. Статическая раздача клиента (HTML)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 PrekClip Server Active on port: ${PORT}`);
    console.log(`📂 Клиент доступен по адресу /`);
});
