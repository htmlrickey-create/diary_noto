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
// static
// =======================
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// multer（画像拡張子付き保存版）
// =======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext);
    }
});

const upload = multer({ storage });
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

db.connect((err) => {
    if (err) {
        console.log("DB接続エラー", err);
    } else {
        console.log("MySQL接続成功");
    }
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
        return res.status(401).json({
            error: "ログインしてください"
        });
    }

    next();
}

// =======================
// register
// =======================
app.post("/register", async (req, res) => {

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            message: "入力不足"
        });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, hashedPassword],
        (err) => {

            if (err) {
                return res.status(500).json({
                    message: "登録失敗"
                });
            }

            res.json({
                message: "登録成功"
            });
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

            if (err) {
                return res.status(500).json({
                    message: "server error"
                });
            }

            if (results.length === 0) {
                return res.status(401).json({
                    message: "ユーザーなし"
                });
            }

            const user = results[0];

            const match = await bcrypt.compare(
                password,
                user.password
            );

            if (!match) {
                return res.status(401).json({
                    message: "パスワード違う"
                });
            }

            req.session.userId = user.id;
            req.session.username = user.username;

            res.json({
                message: "ログイン成功",
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        }
    );
});

// =======================
// me
// =======================
app.get("/api/me", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({
            loggedIn: false
        });
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
        res.json({
            message: "ログアウト完了"
        });
    });
});

// =======================
// 投稿
// =======================
app.post(
    "/api/diary",
    isLogin,
    upload.single("image"),
    (req, res) => {

        const sql = `
            INSERT INTO diares
            (title, content, date, image, user_id)
            VALUES (?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                req.body.title,
                req.body.content,
                req.body.date,
                req.file ? req.file.filename : null,
                req.session.userId
            ],
            (err, result) => {

                if (err) {
                    return res.status(500).json({
                        error: "DBエラー"
                    });
                }

                res.json({
                    message: "保存成功",
                    id: result.insertId
                });
            }
        );
    }
);

// =======================
// diary delete
// =======================
app.delete("/api/diary/:id", isLogin, (req, res) => {

    const diaryId = req.params.id;
    const userId = req.session.userId;

    db.query(
        "DELETE FROM diares WHERE id = ? AND user_id = ?",
        [diaryId, userId],
        (err, result) => {

            if (err) {
                console.log(err);
                return res.status(500).json({
                    error: "削除失敗"
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "日記が見つからない"
                });
            }

            res.json({
                message: "削除成功"
            });
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

            if (err) {
                return res.status(500).json({
                    error: "取得失敗"
                });
            }

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
            SELECT friend_id
            FROM friendships
            WHERE user_id = ?

            UNION

            SELECT user_id
            FROM friendships
            WHERE friend_id = ?
        )
        ORDER BY d.id DESC
    `;

    db.query(
        sql,
        [
            req.session.userId,
            req.session.userId,
            req.session.userId
        ],
        (err, result) => {

            if (err) {
                return res.status(500).json({
                    error: "取得失敗"
                });
            }

            res.json(result);
        }
    );
});

// =======================
// friend request
// =======================
app.post("/api/friend", isLogin, (req, res) => {

    const { friendId } = req.body;

    if (req.session.userId == friendId) {
        return res.json({
            error: "自分には送れません"
        });
    }

    const checkSql = `
        SELECT *
        FROM friend_requests
        WHERE sender_id = ?
        AND receiver_id = ?
        AND status = 'pending'
    `;

    db.query(
        checkSql,
        [req.session.userId, friendId],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: "申請失敗"
                });
            }

            if (rows.length > 0) {
                return res.json({
                    error: "すでに申請済み"
                });
            }

            const insertSql = `
                INSERT INTO friend_requests
                (sender_id, receiver_id)
                VALUES (?, ?)
            `;

            db.query(
                insertSql,
                [req.session.userId, friendId],
                () => {

                    res.json({
                        message: "フレンド申請送信"
                    });
                }
            );
        }
    );
});

// =======================
// request list
// =======================
app.get("/api/friend/request", isLogin, (req, res) => {

    const sql = `
        SELECT
            fr.id,
            fr.sender_id,
            u.username

        FROM friend_requests fr

        JOIN users u
        ON u.id = fr.sender_id

        WHERE fr.receiver_id = ?
        AND fr.status = 'pending'
    `;

    db.query(
        sql,
        [req.session.userId],
        (err, result) => {

            if (err) {
                return res.status(500).json({
                    error: "取得失敗"
                });
            }

            res.json(result);
        }
    );
});

// =======================
// friend accept
// =======================
app.post("/api/friend/accept", isLogin, (req, res) => {

    const { requestId, senderId } = req.body;

    const updateSql = `
        UPDATE friend_requests
        SET status = 'accepted'
        WHERE id = ?
    `;

    db.query(updateSql, [requestId], (err) => {

        if (err) {
            return res.status(500).json({
                error: "承認失敗"
            });
        }

        const friendSql = `
            INSERT INTO friendships
            (user_id, friend_id)
            VALUES (?, ?)
        `;

        db.query(friendSql, [
            req.session.userId,
            senderId
        ]);

        db.query(friendSql, [
            senderId,
            req.session.userId
        ]);

        res.json({
            message: "友達追加成功"
        });
    });
});

// =======================
// like
// =======================
app.post("/api/like", isLogin, (req, res) => {

    const userId = req.session.userId;
    const { postId } = req.body;

    const checkSql = `
        SELECT *
        FROM likes
        WHERE user_id = ?
        AND post_id = ?
    `;

    db.query(
        checkSql,
        [userId, postId],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: "server error"
                });
            }

            // 解除
            if (rows.length > 0) {

                db.query(
                    "DELETE FROM likes WHERE user_id = ? AND post_id = ?",
                    [userId, postId],
                    () => {

                        res.json({
                            liked: false
                        });
                    }
                );

            } else {

                // 追加
                db.query(
                    "INSERT INTO likes (user_id, post_id) VALUES (?, ?)",
                    [userId, postId],
                    () => {

                        res.json({
                            liked: true
                        });
                    }
                );
            }
        }
    );
});

// =======================
// likes count
// =======================
app.get("/api/likes/:postId", (req, res) => {

    db.query(
        "SELECT COUNT(*) AS count FROM likes WHERE post_id = ?",
        [req.params.postId],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: "取得失敗"
                });
            }

            res.json({
                count: rows[0].count
            });
        }
    );
});

// =======================
// mypage
// =======================
app.get("/api/mypage", isLogin, (req, res) => {

    const userId = req.session.userId;

    db.query(
        "SELECT id, username FROM users WHERE id = ?",
        [userId],
        (err, userRows) => {

            if (err) {
                return res.status(500).json({
                    error: "user error"
                });
            }

            const user = userRows[0];

            db.query(
                "SELECT COUNT(*) AS postCount FROM diares WHERE user_id = ?",
                [userId],
                (err, postRows) => {

                    if (err) {
                        return res.status(500).json({
                            error: "post error"
                        });
                    }

                    db.query(
                        "SELECT COUNT(*) AS friendCount FROM friendships WHERE user_id = ?",
                        [userId],
                        (err, friendRows) => {

                            if (err) {
                                return res.status(500).json({
                                    error: "friend error"
                                });
                            }

                            db.query(
                                "SELECT * FROM diares WHERE user_id = ? ORDER BY id DESC",
                                [userId],
                                (err, diaryRows) => {

                                    if (err) {
                                        return res.status(500).json({
                                            error: "diary error"
                                        });
                                    }

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
// profile update
// =======================
app.post("/api/profile", isLogin, (req, res) => {

    const { username } = req.body;

    db.query(
        "UPDATE users SET username = ? WHERE id = ?",
        [username, req.session.userId],
        (err) => {

            if (err) {
                return res.status(500).json({
                    message: "更新失敗"
                });
            }

            req.session.username = username;

            res.json({
                message: "更新成功"
            });
        }
    );
});

// =======================
// start
// =======================
app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});