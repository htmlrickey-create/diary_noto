const express = require("express");
const multer = require("multer");
const path = require("path");
const mysql = require("mysql2");
const session = require("express-session");
const bcrypt = require("bcrypt");
const MySQLStore = require("express-mysql-session")(session);

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// 静的ファイル
// =======================
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// multer
// =======================
const upload = multer({
    dest: path.join(__dirname, "uploads/")
});

// =======================
// DB
// =======================
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

// ★1回だけでOK
db.connect(err => {
    if (err) console.log("DB接続エラー", err);
    else console.log("MySQL接続成功");
});

// =======================
// session store
// =======================
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    createDatabaseTable: true
});

// =======================
// middleware
// =======================
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        sameSite: "none",
        secure: true
    }
}));

// =======================
// ログインチェック
// =======================
function isLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "ログインしてください" });
    }
    next();
}

// =======================
// 新規登録
// =======================
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "入力不足" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, hashedPassword],
        (err) => {
            if (err) return res.status(500).json({ message: "登録失敗" });
            res.json({ message: "登録成功" });
        }
    );
});

// =======================
// ログイン
// =======================
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE username = ?",
        [username],
        async (err, results) => {
            if (err) return res.status(500).json({ message: "エラー" });
            if (results.length === 0) return res.status(401).json({ message: "ユーザーなし" });

            const user = results[0];
            const match = await bcrypt.compare(password, user.password);

            if (!match) return res.status(401).json({ message: "パスワード違う" });

            req.session.userId = user.id;
            req.session.username = user.username;

            res.json({
                message: "ログイン成功",
                user: { id: user.id, username: user.username }
            });
        }
    );
});

// =======================
// me
// =======================
app.get("/api/me", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ loggedIn: false });
    }

    res.json({
        loggedIn: true,
        user: {
            id: req.session.userId,
            username: req.session.username
        }
    });
});

// =======================
// mypage（ここOK）
// =======================
app.get("/api/mypage", isLogin, (req, res) => {

    const userId = req.session.userId;

    db.query(
        "SELECT id, username, email FROM users WHERE id = ?",
        [userId],
        (err, userRows) => {

            if (err) return res.status(500).json({ error: "user error" });

            const user = userRows[0];

            db.query(
                "SELECT COUNT(*) AS postCount FROM diaries WHERE user_id = ?",
                [userId],
                (err, postRows) => {

                    if (err) return res.status(500).json({ error: "post error" });

                    db.query(
                        "SELECT COUNT(*) AS friendCount FROM friendships WHERE user_id = ?",
                        [userId],
                        (err, friendRows) => {

                            if (err) return res.status(500).json({ error: "friend error" });

                            db.query(
                                "SELECT * FROM diaries WHERE user_id = ? ORDER BY id DESC",
                                [userId],
                                (err, diaryRows) => {

                                    if (err) return res.status(500).json({ error: "diary error" });

                                    res.json({
                                        user,
                                        postCount: postRows[0].postCount,
                                        friendCount: friendRows[0].friendCount,
                                        diaries: diaryRows
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// =======================
// profile更新
// =======================
app.post("/api/profile", isLogin, (req, res) => {

    const { username, email } = req.body;

    db.query(
        "UPDATE users SET username = ?, email = ? WHERE id = ?",
        [username, email, req.session.userId],
        (err) => {
            if (err) return res.status(500).json({ message: "更新失敗" });

            req.session.username = username;

            res.json({ message: "更新成功" });
        }
    );
});

// =======================
// logout
// =======================
app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ message: "ログアウト完了" });
    });
});

// =======================
// 以下そのままOK（diary / friend / like系）
// =======================

// ★ここはあなたのコードそのままでOK

app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});