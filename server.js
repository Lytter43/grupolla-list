require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'grupolla-super-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS on production
}));
app.use(passport.initialize());
app.use(passport.session());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Database Setup (PostgreSQL)
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) console.error("Database connection error:", err);
    else console.log("Connected to PostgreSQL database.");
});

// Handle idle connection errors (Neon auto-suspends databases)
db.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

async function initDB() {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT,
            discord_id TEXT UNIQUE,
            role TEXT DEFAULT 'user'
        )`);

        await db.query(`CREATE TABLE IF NOT EXISTS levels (
            id SERIAL PRIMARY KEY,
            rank INTEGER,
            name TEXT,
            creator TEXT,
            verifier TEXT,
            video_id TEXT
        )`);

        await db.query(`CREATE TABLE IF NOT EXISTS records (
            id SERIAL PRIMARY KEY,
            level_id INTEGER,
            player TEXT,
            progress INTEGER,
            proof TEXT,
            status TEXT DEFAULT 'pending',
            user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log("Database tables checked/created.");
    } catch (err) {
        console.error("Error creating tables:", err);
    }
}
initDB();

// --- Passport Configuration ---

// Serialize/Deserialize
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const res = await db.query(`SELECT id, username, email, role FROM users WHERE id = $1`, [id]);
        done(null, res.rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// Local Strategy (Email/Password)
passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
        try {
            const res = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
            const user = res.rows[0];
            if (!user) return done(null, false, { message: 'Incorrect email.' });
            
            bcrypt.compare(password, user.password, (err, isValid) => {
                if (err) return done(err);
                if (isValid) return done(null, user);
                else return done(null, false, { message: 'Incorrect password.' });
            });
        } catch (err) {
            done(err);
        }
    }
));

// Discord Strategy
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    passport.use(new DiscordStrategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/auth/discord/callback` : 'http://localhost:3000/auth/discord/callback',
        scope: ['identify', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const res = await db.query(`SELECT * FROM users WHERE discord_id = $1`, [profile.id]);
            const user = res.rows[0];
            if (user) return done(null, user);

            // Create new user from Discord
            const newRole = profile.username === 'lyxen7' ? 'admin' : 'user';
            const insertRes = await db.query(
                `INSERT INTO users (username, email, discord_id, role) VALUES ($1, $2, $3, $4) RETURNING *`, 
                [profile.username, profile.email, profile.id, newRole]
            );
            done(null, insertRes.rows[0]);
        } catch (err) {
            done(err);
        }
    }));
}

// --- Routes ---

// Get all levels
app.get('/api/levels', async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM levels ORDER BY rank ASC`);
        res.json({ levels: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT player, COUNT(id) as score 
            FROM records 
            WHERE status = 'approved' AND progress = 100 
            GROUP BY player 
            ORDER BY score DESC
        `);
        // postgres COUNT returns string/bigint, so convert to number just in case
        const formattedLeaderboard = result.rows.map(row => ({
            player: row.player,
            score: parseInt(row.score, 10)
        }));
        res.json({ leaderboard: formattedLeaderboard });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Add Level
app.post('/api/admin/levels', async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { rank, name, creator, verifier, video_id } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO levels (rank, name, creator, verifier, video_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [rank, name, creator, verifier, video_id || '']
        );
        res.json({ message: 'Level added successfully', id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Delete Level
app.delete('/api/admin/levels/:id', async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        // Run in transaction if possible, but sequential is fine for now
        await db.query(`DELETE FROM records WHERE level_id = $1`, [req.params.id]);
        await db.query(`DELETE FROM levels WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Level deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id`, 
            [username, email, hashedPassword, 'user']
        );
        res.json({ message: 'User registered successfully', userId: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email or username already exists' }); // PG unique constraint violation
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/login', passport.authenticate('local'), (req, res) => {
    res.json({ message: 'Logged in successfully', user: req.user });
});

// Logout
app.post('/api/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.json({ message: 'Logged out successfully' });
    });
});

// Get Current User
app.get('/api/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ user: req.user });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// Discord Auth Routes
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/' 
}), (req, res) => {
    res.redirect('/');
});

// --- Record Routes ---

// Get approved records for a level
app.get('/api/records/:level_id', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, player, progress, proof FROM records WHERE level_id = $1 AND status = 'approved'`, 
            [req.params.level_id]
        );
        res.json({ records: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit a new record
app.post('/api/records', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    const { level_id, progress, proof } = req.body;
    const player = req.user.username; 
    try {
        const result = await db.query(
            `INSERT INTO records (level_id, player, progress, proof, user_id, status) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
            [level_id, player, progress, proof, req.user.id]
        );
        res.json({ message: 'Record submitted successfully', recordId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Admin Routes ---

// Middleware to check admin
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') return next();
    res.status(403).json({ error: 'Forbidden' });
}

// Get pending records
app.get('/api/admin/pending', isAdmin, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT records.*, users.username as submitter FROM records LEFT JOIN users ON records.user_id = users.id WHERE records.status = 'pending'`
        );
        res.json({ pending: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve record
app.post('/api/admin/approve/:id', isAdmin, async (req, res) => {
    try {
        await db.query(`UPDATE records SET status = 'approved' WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Record approved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Reject Record
app.post('/api/admin/reject/:id', async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    try {
        await db.query(`UPDATE records SET status = 'rejected' WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Record rejected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Delete Record
app.delete('/api/admin/records/:id', async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    try {
        await db.query(`DELETE FROM records WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
