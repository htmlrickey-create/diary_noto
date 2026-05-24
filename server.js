const express = require("express");
const multer = require("multer");
const path = require("path");
const mysql = require("mysql2");
const session = require("express-session");
const bcrypt = require("bcrypt");
const MySQLStore = require("express-mysql-session")(session);

const app = express();

// =======================
// Render用ポート
// =======================
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
// DB（Render用：環境変数対応）
// =======================
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "root",
    database: process.env.DB_NAME || "dairy_noto"
});

db.connect(err => {
    if (err) console.log("DB接続エラー", err);
    else console.log("MySQL接続成功");
});

// =======================
// session（Render用）
// =======================
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "root",
    database: process.env.DB_NAME || "dairy_noto"
});

// Render対応（proxy必須）
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
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
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
// 投稿
// =======================
app.post("/api/diary", isLogin, upload.single("image"), (req, res) => {

    const sql = `
        INSERT INTO diares (title, content, date, image, user_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        req.body.title,
        req.body.content,
        req.body.date,
        req.file ? req.file.filename : null,
        req.session.userId
    ], (err, result) => {

        if (err) return res.status(500).json({ error: "DBエラー" });

        res.json({
            message: "保存成功",
            id: result.insertId
        });
    });
});

// =======================
// 自分の日記
// =======================
app.get("/api/diary", isLogin, (req, res) => {

    db.query(
        "SELECT * FROM diares WHERE user_id = ? ORDER BY id DESC",
        [req.session.userId],
        (err, result) => {
            if (err) return res.status(500).json({ error: "取得失敗" });
            res.json(result);
        }
    );
});

// =======================
// 友達＋自分の日記
// =======================
app.get("/api/friends-diary", isLogin, (req, res) => {

    const sql = `
        SELECT d.*
        FROM diares d
        WHERE d.user_id = ?
        OR d.user_id IN (
            SELECT friend_id FROM friendships WHERE user_id = ?
            UNION
            SELECT user_id FROM friendships WHERE friend_id = ?
        )
        ORDER BY d.id DESC
    `;

    db.query(sql,
        [req.session.userId, req.session.userId, req.session.userId],
        (err, result) => {
            if (err) return res.status(500).json({ error: "取得失敗" });
            res.json(result);
        }
    );
});

// =======================
// フレンド申請
// =======================
app.post("/api/friend", isLogin, (req, res) => {

    const { friendId } = req.body;

    if (req.session.userId == friendId) {
        return res.json({ error: "自分には送れません" });
    }

    const checkSql = `
        SELECT * FROM friend_requests
        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `;

    db.query(checkSql, [req.session.userId, friendId], (err, rows) => {

        if (err) return res.status(500).json({ error: "申請失敗" });

        if (rows.length > 0) {
            return res.json({ error: "すでに申請済みです" });
        }

        const insertSql = `
            INSERT INTO friend_requests (sender_id, receiver_id)
            VALUES (?, ?)
        `;

        db.query(insertSql, [req.session.userId, friendId], () => {
            res.json({ message: "フレンド申請送信" });
        });
    });
});

// =======================
// 申請一覧
// =======================
app.get("/api/friend/request", isLogin, (req, res) => {

    const sql = `
        SELECT fr.id, fr.sender_id, u.username
        FROM friend_requests fr
        JOIN users u ON u.id = fr.sender_id
        WHERE fr.receiver_id = ? AND fr.status = 'pending'
    `;

    db.query(sql, [req.session.userId], (err, result) => {
        if (err) return res.status(500).json({ error: "取得失敗" });
        res.json(result);
    });
});

// =======================
// フレンド承認
// =======================
app.post("/api/friend/accept", isLogin, (req, res) => {

    const { requestId, senderId } = req.body;

    const updateSql = `
        UPDATE friend_requests
        SET status = 'accepted'
        WHERE id = ?
    `;

    db.query(updateSql, [requestId], (err) => {

        if (err) return res.status(500).json({ error: "承認失敗" });

        const friendSql = `
            INSERT INTO friendships (user_id, friend_id)
            VALUES (?, ?)
        `;

        db.query(friendSql, [req.session.userId, senderId]);
        db.query(friendSql, [senderId, req.session.userId]);

        res.json({ message: "友達追加成功" });
    });
});

// =======================
// いいね
// =======================
app.post("/api/like", isLogin, (req, res) => {

    const userId = req.session.userId;
    const { postId } = req.body;

    const checkSql = `
        SELECT * FROM likes
        WHERE user_id = ? AND post_id = ?
    `;

    db.query(checkSql, [userId, postId], (err, rows) => {

        if (err) return res.status(500).json({ error: "server error" });

        if (rows.length > 0) {

            db.query(
                "DELETE FROM likes WHERE user_id = ? AND post_id = ?",
                [userId, postId],
                () => res.json({ liked: false })
            );

        } else {

            db.query(
                "INSERT INTO likes (user_id, post_id) VALUES (?, ?)",
                [userId, postId],
                () => res.json({ liked: true })
            );
        }
    });
});

// =======================
// いいね数
// =======================
app.get("/api/likes/:postId", (req, res) => {

    db.query(
        "SELECT COUNT(*) AS count FROM likes WHERE post_id = ?",
        [req.params.postId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "取得失敗" });
            res.json({ count: rows[0].count });
        }
    );
});

// =======================
// Render起動
// =======================
app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});