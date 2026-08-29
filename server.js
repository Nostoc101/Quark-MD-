import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import makeWASocket, { useMultiFileAuthState, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// DB FOR 500+ SESSIONS
const db = new Database('db.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    status TEXT DEFAULT 'waiting',
    code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const addSession = db.prepare('INSERT OR IGNORE INTO sessions (number, status) VALUES (?, "waiting")');
const updateSession = db.prepare('UPDATE sessions SET status = ?, code = ? WHERE number = ?');
const getAllSessions = db.prepare('SELECT * FROM sessions ORDER BY id DESC');

// WEB PANEL
app.use(express.json());
app.use(express.static('public'));

app.get('/api/sessions', (req,res) => res.json(getAllSessions.all()));
app.post('/api/pair', async (req,res) => {
    const { number } = req.body;
    if(!number) return res.status(400).json({error: 'Number required'});
    addSession.run(number);
    startSession(number);
    res.json({success: true, msg: `Pairing started for ${number}`});
});

server.listen(PORT, () => console.log(`Panel running on port ${PORT}`));

// MULTI-SESSION MANAGER
const sessions = new Map();

async function startSession(number) {
    const sessionPath = `auth_info/${number}`;
    if(!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, {recursive: true});
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const sock = makeWASocket({
        logger: pino({level: 'silent'}),
        auth: state,
        browser: Browsers.macOS('Desktop'),
        printQRInTerminal: false
    });
    
    sessions.set(number, sock);
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if(connection === 'open') {
            updateSession.run('connected', null, number);
            io.emit('status', {number, status: 'connected'});
            console.log(`${number} CONNECTED`);
        }
        if(connection === 'close') sessions.delete(number);
        
        if(!state.creds.registered) {
            const code = await sock.requestPairingCode(number);
            updateSession.run('waiting', code, number);
            io.emit('code', {number, code});
            console.log(`CODE FOR ${number}: ${code}`);
        }
    });
    
    // HERE: Paste your DANGER-MD message handler from index.js
}