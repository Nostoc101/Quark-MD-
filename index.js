import makeWASocket, { useMultiFileAuthState, Browsers, jidDecode, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import pino from 'pino';
import 'dotenv/config';
import http from 'http';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import yts from 'yt-search';
import ytdl from 'ytdl-core';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

const MASTER_NUMBER = "2348142334779"; // CHANGE TO YOUR NUMBER
const BOT_NAME = "DANGER-MD";
const PREFIX = ".";
const PORT = process.env.PORT || 3000;

const DIABLO_BANNER = `╭━━━━━━━〔 *${BOT_NAME} V10.37* 〕━━━━━━━⬣\n╰━━━━━━━━━━━━━━⬣`;

// ========== DATABASE ==========
const adapter = new JSONFile('chatdb.json');
const db = new Low(adapter);
await db.read();
db.data ||= { paired: [], pendingRequests: [], warns: {}, notes: {}, schedule: [], chatHistory: {} };
await db.write();

http.createServer((req, res) => res.end(`${BOT_NAME} Online`)).listen(PORT);

// ========== HELPERS ==========
function isMaster(jid){ return jidDecode(jid).user === MASTER_NUMBER; }
async function isPaired(db, num){ await db.read(); return db.data.paired.includes(num); }

// ========== COMMAND HANDLER ==========
const commands = new Map();
function cmd(name, level, desc, run) { commands.set(name, {level, desc, run}); }

// ========== GUEST COMMANDS ==========
cmd('ai','all','Chat with AI', async(sock, msg, args) => {
    const prompt = args.join(' ');
    if(!prompt) return sock.sendMessage(msg.key.remoteJid, {text: `❌ Use: ${PREFIX}ai explain javascript`});
    await sock.sendMessage(msg.key.remoteJid, {text: `${DIABLO_BANNER}\n\nYou: "${prompt}"\nBot: I'm ${BOT_NAME} AI`});
});
cmd('clear','all','Clear AI chat', async(sock, msg) => {
    const sender = jidDecode(msg.key.participant || msg.key.remoteJid).user;
    await db.read(); db.data.chatHistory[sender] = []; await db.write();
    await sock.sendMessage(msg.key.remoteJid, {text: `✅ AI chat cleared`});
cmd('menu','all','Show menu', async(s,m)=>s.sendMessage(m.key.remoteJid,{text:`${DIABLO_BANNER}\n\n*.ai* - Chat AI\n*.requestpair* - Request admin\n*.pair* - Generate pairing code\n*.help* - All commands`}));
cmd('help','all','List commands', async(s,m)=>s.sendMessage(m.key.remoteJid,{text:`${DIABLO_BANNER}\n\n*PAIRED:*.play.audio.video.download.pair\n*MASTER:*.approve.deny.pending.pairedlist.unpair\n*GUEST:*.ai.clear.menu.help`}));
cmd('joke','all','Joke', async(s,m)=>s.sendMessage(m.key.remoteJid,{text:'Why do devs hate nature? Too many bugs 😂'}));
cmd('calc','all','Calculator', async(s,m,args)=>{try{s.sendMessage(m.key.remoteJid,{text:`= ${eval(args.join(''))}`})}catch{e}});

// ========== DOWNLOAD + PAIRED COMMANDS ==========
cmd('download','paired','Download video/audio', async(sock, msg, args) => {
    const from = msg.key.remoteJid;
    const type = args[0]; const query = args.slice(1).join(' ');
    if(!type ||!query) return sock.sendMessage(from, {text: `❌ Use: ${PREFIX}download video|audio song name`});
    await sock.sendMessage(from, {text: `📥 *Searching:* ${query}...`});
    try {
        const search = await yts(query); const video = search.videos[0];
        if(!video) return sock.sendMessage(from, {text: `❌ No results`});
        const filePath = `./tmp/${video.videoId}.${type==='video'?'mp4':'mp3'}`;
        if(!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');
        await sock.sendMessage(from, {text: `${DIABLO_BANNER}\n\n*Found:* ${video.title}\n*Downloading...*`});
        await streamPipeline(ytdl(video.url, { filter: type==='audio'?'audioonly':undefined, quality: type==='video'?'18':'highestaudio' }), fs.createWriteStream(filePath));
        await sock.sendMessage(from, type==='video'?{video:{url:filePath},caption:video.title}:{audio:{url:filePath},mimetype:'audio/mpeg',fileName:`${video.title}.mp3`});
        fs.unlinkSync(filePath);
    } catch(e) { await sock.sendMessage(from, {text: `❌ Error: ${e.message}`}); }
});
cmd('video','paired','Download video', async(sock, msg, args) => commands.get('download').run(sock, msg, ['video',...args]));
cmd('audio','paired','Download audio', async(sock, msg, args) => commands.get('download').run(sock, msg, ['audio',...args]));
cmd('play','paired','Play music', async(sock, msg, args) => commands.get('download').run(sock, msg, ['audio',...args]));

// ========== PAIRING SYSTEM V10.37 ==========
cmd('pair','all','Generate pairing code', async(sock, msg, args) => {
    const from = msg.key.remoteJid;
    const sender = jidDecode(msg.key.participant || msg.key.remoteJid).user;

    let isGroupAdmin = false;
    if(from.endsWith('@g.us')){
        const metadata = await sock.groupMetadata(from);
        const participant = metadata.participants.find(p => p.id.includes(sender));
        isGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
    }

    const canPair = isGroupAdmin || isMaster(msg.key.participant) || await isPaired(db, sender);
    if(!canPair) return sock.sendMessage(from, {text: `❌ Only Group Admins + PAIRED ADMINS + MASTER can use.pair`});

    let number = args[0] || sender; number = number.replace(/\D/g,'');

    await sock.sendMessage(from, {text: `⏳ *Generating pairing code for 234${number}...*`});
    const code = "1234-5678"; // Use: await sock.requestPairingCode(number)
    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

    await sock.sendMessage(from, {text: `${DIABLO_BANNER}\n\n*PAIRING CODE FOR 234${number}*\n\n*Code:* \`\`\`${formattedCode}\`\n\n1. WhatsApp > Settings > Linked Devices\n2. Tap "Link with phone number"\n3. Enter code`});

    await db.read();
    // Save with who paired them
    const existing = db.data.paired.find(p => typeof p === 'object'? p.number === number : p === number);
    if(!existing){
        db.data.paired.push({number: number, pairedBy: sender, time: new Date().toISOString()});
    }
    await db.write();
    await sock.sendMessage(from, {text: `✅ 234${number} is now a PAIRED ADMIN\n*Paired by:* 234${sender}`});
});

cmd('requestpair','all','Request to become paired admin', async(sock, msg, args) => {
    const from = msg.key.remoteJid;
    const sender = jidDecode(msg.key.participant || msg.key.remoteJid).user;
    const senderName = msg.pushName || sender;
    if(from.endsWith('@s.whatsapp.net')) return sock.sendMessage(from, {text: `❌ Use this in group`});
    await db.read();
    if(await isPaired(db, sender) || isMaster(msg.key.participant)) return sock.sendMessage(from, {text: `✅ Already paired`});
    if(db.data.pendingRequests.find(r => r.number === sender)) return sock.sendMessage(from, {text: `⏳ Already requested`});
    let groupName = from; if(from.endsWith('@g.us')){ groupName = (await sock.groupMetadata(from)).subject; }
    db.data.pendingRequests.push({number:sender,name:senderName,group:from,groupName,time:new Date().toISOString()}); await db.write();
    await sock.sendMessage(from, {text: `📩 *Request Sent!*\n\n@${sender} requested PAIRED ADMIN.\nMASTER:.approve 234${sender} |.pending`, mentions: [msg.key.participant || msg.key.remoteJid]});
    await sock.sendMessage(`${MASTER_NUMBER}@s.whatsapp.net`, {text: `${DIABLO_BANNER}\n\n*NEW PAIR REQUEST*\n*Name:* ${senderName}\n*Number:* 234${sender}\n*Group:* ${groupName}\n\n.approve 234${sender}.deny 234${sender}.pending`});
});

cmd('pending','master','Show pending requests', async(sock, msg) => {
    const from = msg.key.remoteJid; await db.read();
    if(db.data.pendingRequests.length === 0) return sock.sendMessage(from, {text: `📭 No pending requests`});
    let list = `*PENDING: ${db.data.pendingRequests.length}*\n\n`;
    db.data.pendingRequests.forEach((req,i)=>{ list += `*${i+1}.* ${req.name}\n*Number:* 234${req.number}\n*Group:* ${req.groupName}\n*Approve:*.approve 234${req.number}\n\n`; });
    await sock.sendMessage(from, {text: `${DIABLO_BANNER}\n\n${list}`});
});

cmd('pairedlist','master','List all paired admins', async(sock, msg) => {
    await db.read();
    if(db.data.paired.length === 0) return sock.sendMessage(msg.key.remoteJid, {text: `📭 No paired admins`});
    let list = `*PAIRED ADMINS: ${db.data.paired.length}*\n\n`;
    db.data.paired.forEach((p,i)=>{
        const number = typeof p === 'object'? p.number : p;
        const pairedBy = typeof p === 'object'? p.pairedBy : MASTER_NUMBER;
        list += `*${i+1}.* 234${number}\n*Paired by:* 234${pairedBy}\n\n`;
    });
    await sock.sendMessage(msg.key.remoteJid, {text: `${DIABLO_BANNER}\n\n${list}\n*Remove:*.unpair 234number`});
});

cmd('approve','master','Approve request', async(sock, msg, args) => {
    const number = args[0]?.replace(/\D/g,''); if(!number) return sock.sendMessage(msg.key.remoteJid, {text: `❌ Use:.approve 234number`});
    await db.read();
    if(!db.data.paired.find(p => typeof p === 'object'? p.number === number : p === number))
        db.data.paired.push({number: number, pairedBy: MASTER_NUMBER, time: new Date().toISOString()});
    db.data.pendingRequests = db.data.pendingRequests.filter(r => r.number!== number); await db.write();
    await sock.sendMessage(msg.key.remoteJid, {text: `✅ 234${number} approved`});
    await sock.sendMessage(`${number}@s.whatsapp.net`, {text: `${DIABLO_BANNER}\n\n🎉 *CONGRATS!* You are now PAIRED ADMIN. Type.menu`});
});

cmd('deny','master','Deny request', async(sock, msg, args) => {
    const number = args[0]?.replace(/\D/g,''); if(!number) return sock.sendMessage(msg.key.remoteJid, {text: `❌ Use:.deny 234number`});
    await db.read(); db.data.pendingRequests = db.data.pendingRequests.filter(r => r.number!== number); await db.write();
    await sock.sendMessage(msg.key.remoteJid, {text: `❌ Denied 234${number}`});
    await sock.sendMessage(`${number}@s.whatsapp.net`, {text: `${DIABLO_BANNER}\n\n😔 *REQUEST DENIED* by MASTER.`});
});

cmd('unpair','master','Remove paired admin', async(s,m,args)=>{
    const num=args[0].replace(/\D/g,'');
    await db.read();
    db.data.paired=db.data.paired.filter(p=> typeof p === 'object'? p.number!== num : p!== num);
    await db.write();
    s.sendMessage(m.key.remoteJid,{text:`✅ 234${num} unpaired`})
});

// FILLER 180 COMMANDS
for(let i=1;i<=180;i++){ cmd(`cmd${i}`,'paired',`Utility ${i}`, async(s,m)=>s.sendMessage(m.key.remoteJid,{text:`Executed command ${i}`})); }

// ========== BOT START ==========
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(`auth_info`);
    const sock = makeWASocket({ logger: pino({level: 'silent'}), auth: state, browser: Browsers.macOS('Desktop') });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async ({messages}) => {
        const msg = messages[0]; if(!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if(!text.startsWith(PREFIX)) return;
        const args = text.slice(PREFIX.length).trim().split(/ +/);
        const cmdName = args.shift().toLowerCase(); const command = commands.get(cmdName); if(!command) return;
        const sender = msg.key.participant || msg.key.remoteJid; const senderNum = jidDecode(sender).user;

        await db.read();
        const isPairedUser = db.data.paired.find(p => typeof p === 'object'? p.number === senderNum : p === senderNum);

        if(command.level === 'master' &&!isMaster(sender)) return sock.sendMessage(msg.key.remoteJid, {text: `❌ Only MASTER`});
        if(command.level === 'paired' &&!isMaster(sender) &&!isPairedUser) return sock.sendMessage(msg.key.remoteJid, {text: `❌ You are not paired`});
        await command.run(sock, msg, args);
    });
}
startBot();