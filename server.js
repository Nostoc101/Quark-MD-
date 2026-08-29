import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import makeWASocket, { useMultiFileAuthState, Browsers, jidDecode, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import yts from 'yt-search';
import ytdl from 'ytdl-core';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { Boom } from '@hapi/boom';
import Database from 'better-sqlite3';

const streamPipeline = promisify(pipeline);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ========== VARIABLES FROM RAILWAY ==========
const MASTER = process.env.MASTER || "2348142334779"
const ADMINS = (process.env.ADMINS || MASTER).split(',')
const PREFIX = process.env.PREFIX || "."
const BOT_NAME = process.env.BOT_NAME || "DANGER-MD"
const PORT = process.env.PORT || 3000
const DIABLO_BANNER = `╭━━━━━━━〔 *${BOT_NAME} V10.38* 〕━━━━━━━⬣\n╰━━━━━━━━━━━━━━⬣`

const app = express();
const server = createServer(app);
const io = new Server(server);

// ========== DATABASE FOR 500+ DEVICES ==========
const db = new Low(new JSONFile('chatdb.json'));
await db.read();
db.data ||= { paired: [], pendingRequests: [], warns: {}, notes: {}, schedule: [], chatHistory: {} };
await db.write();

const sqlDb = new Database('db.sqlite');
sqlDb.exec(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE, status TEXT DEFAULT 'waiting', code TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
const addSession = sqlDb.prepare('INSERT OR IGNORE INTO sessions (number, status) VALUES (?, "waiting")');
const updateSession = sqlDb.prepare('UPDATE sessions SET status =?, code =? WHERE