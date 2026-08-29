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

// ========== VARIABLES FROM RAILWAY ==========
const MASTER = process.env.MASTER || "2348142334779" // Your main number
const PREFIX = process.env.PREFIX || "."
const BOT_NAME = process.env.BOT_NAME || "DANGER-MD"
const PORT = process.env.PORT || 3000

console.log(`Starting ${BOT_NAME} | Master: ${MASTER} | Prefix: ${PREFIX}`)

// ========== DATABASE FOR 500+ DEVICES ==========
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

// ========== EXPRESS + WEB PANEL ==========
app.use(express.json());
app.use(express.static('public'));

app.get('/api/sessions', (req,res) => res