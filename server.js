const express = require("express");
const multer = require("multer");
const path = require("path");
const mysql = require("mysql2");
const session = require("express-session");
const bcrypt = require("bcrypt");
const MySQLStore = require("express-mysql-session")(session);

// ⭐追加
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// Cloudinary設定
// =======================
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET
});

// =======================
// multer（Cloudinary化）
// =======================
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "diary_app",
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
    }
});

const upload = multer({ storage });

// =======================
// static（uploads削除してOK）
// =======================
app.use(express.static("public"));

// =======================
// DB
// =======================
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) console.log("DB接続エラー", err);
    else console.log("MySQL接続成功");
});

// =======================
// session
// =======================
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    createDatabaseTable: true
});

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
// login check
// =======================
function isLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "ログインしてください" });
    }
    next();
}

// =======================
// register
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
// login
// =======================
app.post("/login", (req, res) => {

    const { username, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE username = ?",
        [username],
        async (err, results) => {

            if (err) return res.status(500).json({ message: "server error" });
            if (results.length === 0) {
                return res.status(401).json({ message: "ユーザーなし" });
            }

            const user = results[0];
            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.status(401).json({ message: "パスワード違う" });
            }

            req.session.userId = user.id;
            req.session.username = user.username;

            res.json({
                message: "ログイン成功",
                user
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
// logout
// =======================
app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ message: "ログアウト完了" });
    });
});

// =======================
// 投稿（Cloudinary対応）
// =======================
app.post("/api/diary", isLogin, upload.single("image"), (req, res) => {

    const imageUrl = req.file ? req.file.path : null;

    const sql = `
        INSERT INTO diares
        (title, content, date, image, user_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        req.body.title,
        req.body.content,
        req.body.date,
        imageUrl,
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
// diary delete（そのまま維持）
// =======================
app.delete("/api/diary/:id", isLogin, (req, res) => {

    const diaryId = req.params.id;
    const userId = req.session.userId;

    db.query(
        "DELETE FROM diares WHERE id = ? AND user_id = ?",
        [diaryId, userId],
        (err, result) => {

            if (err) {
                return res.status(500).json({ error: "削除失敗" });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "日記が見つからない" });
            }

            res.json({ message: "削除成功" });
        }
    );
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
// friend diary
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

    db.query(sql, [
        req.session.userId,
        req.session.userId,
        req.session.userId
    ], (err, result) => {

        if (err) return res.status(500).json({ error: "取得失敗" });
        res.json(result);
    });
});

// =======================
// friend request（安全版）
// =======================
app.post("/api/friend", isLogin, (req, res) => {

    const friendId = Number(req.body.friendId);

    if (!friendId) {
        return res.status(400).json({ error: "不正なユーザーID" });
    }

    if (req.session.userId === friendId) {
        return res.json({ error: "自分には送れません" });
    }

    const checkSql = `
        SELECT id FROM friend_requests
        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `;

    db.query(checkSql, [req.session.userId, friendId], (err, rows) => {

        if (err) {
            console.error(err);
            return res.status(500).json({ error: "申請失敗" });
        }

        if (rows.length > 0) {
            return res.json({ error: "すでに申請済みです" });
        }

        const insertSql = `
            INSERT INTO friend_requests (sender_id, receiver_id, status)
            VALUES (?, ?, 'pending')
        `;

        db.query(insertSql, [req.session.userId, friendId], (err2) => {

            if (err2) {
                console.error(err2);
                return res.status(500).json({ error: "申請作成失敗" });
            }

            return res.json({ message: "フレンド申請送信しました" });
        });
    });
});


// =======================
// request list（安全版）
// =======================
app.get("/api/friend/request", isLogin, (req, res) => {

    const sql = `
        SELECT fr.id, fr.sender_id, u.username
        FROM friend_requests fr
        JOIN users u ON u.id = fr.sender_id
        WHERE fr.receiver_id = ? AND fr.status = 'pending'
        ORDER BY fr.id DESC
    `;

    db.query(sql, [req.session.userId], (err, result) => {

        if (err) {
            console.error(err);
            return res.status(500).json({ error: "取得失敗" });
        }

        return res.json(result);
    });
});

// =======================
// mypage API
// =======================
app.get("/api/mypage", isLogin, (req, res) => {

    const userId = req.session.userId;

    const userSql = `
        SELECT id, username, email
        FROM users
        WHERE id = ?
    `;

    const diarySql = `
        SELECT *
        FROM diares
        WHERE user_id = ?
        ORDER BY id DESC
    `;

    const friendCountSql = `
        SELECT COUNT(*) AS count
        FROM friendships
        WHERE user_id = ?
    `;

    const postCountSql = `
        SELECT COUNT(*) AS count
        FROM diares
        WHERE user_id = ?
    `;

    db.query(userSql, [userId], (err, userResult) => {

        if (err || userResult.length === 0) {
            return res.status(500).json({ error: "ユーザー取得失敗" });
        }

        const user = userResult[0];

        db.query(diarySql, [userId], (err2, diaries) => {

            if (err2) {
                return res.status(500).json({ error: "日記取得失敗" });
            }

            db.query(friendCountSql, [userId], (err3, friendResult) => {

                if (err3) {
                    return res.status(500).json({ error: "フレンド数取得失敗" });
                }

                db.query(postCountSql, [userId], (err4, postResult) => {

                    if (err4) {
                        return res.status(500).json({ error: "投稿数取得失敗" });
                    }

                    res.json({
                        user,
                        diaries,
                        friendCount: friendResult[0].count,
                        postCount: postResult[0].count
                    });
                });
            });
        });
    });
});


// =======================
// friend accept（安全版）
// =======================
app.post("/api/friend/accept", isLogin, (req, res) => {

    const requestId = Number(req.body.requestId);
    const senderId = Number(req.body.senderId);

    if (!requestId || !senderId) {
        return res.status(400).json({ error: "不正なリクエスト" });
    }

    // まず本当に自分宛の申請かチェック
    const checkSql = `
        SELECT * FROM friend_requests
        WHERE id = ? AND receiver_id = ? AND status = 'pending'
    `;

    db.query(checkSql, [requestId, req.session.userId], (err, rows) => {

        if (err) {
            console.error(err);
            return res.status(500).json({ error: "承認失敗" });
        }

        if (rows.length === 0) {
            return res.status(403).json({ error: "この申請は処理できません" });
        }

        const updateSql = `
            UPDATE friend_requests
            SET status = 'accepted'
            WHERE id = ?
        `;

        db.query(updateSql, [requestId], (err2) => {

            if (err2) {
                console.error(err2);
                return res.status(500).json({ error: "承認更新失敗" });
            }

            // 重複防止チェック（超重要）
            const existsSql = `
                SELECT id FROM friendships
                WHERE user_id = ? AND friend_id = ?
            `;

            db.query(existsSql, [req.session.userId, senderId], (err3, rows2) => {

                if (err3) {
                    console.error(err3);
                    return res.status(500).json({ error: "友達確認失敗" });
                }

                if (rows2.length === 0) {

                    const insertSql = `
                        INSERT INTO friendships (user_id, friend_id)
                        VALUES (?, ?)
                    `;

                    db.query(insertSql, [req.session.userId, senderId]);
                    db.query(insertSql, [senderId, req.session.userId]);
                }

                return res.json({ message: "友達追加成功" });
            });
        });
    });
});

// =======================
// like（そのまま維持）
// =======================
app.post("/api/like", isLogin, (req, res) => {

    const userId = req.session.userId;
    const { postId } = req.body;

    const checkSql = `
        SELECT * FROM likes
        WHERE user_id = ? AND post_id = ?
    `;

    db.query(checkSql, [userId, postId], (err, rows) => {

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
// start
// =======================
app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});