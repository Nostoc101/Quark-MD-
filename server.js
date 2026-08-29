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

const streamPipeline = promisify(pipeline);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MASTER = process.env.MASTER || "2348142334779"
const ADMINS = (process.env.ADMINS || MASTER).split(',')
const PREFIX = process.env.PREFIX || "."
const BOT_NAME = process.env.BOT_NAME || "DANGER-MD"
const PORT = process.env.PORT || 3000
const DIABLO_BANNER = `╭━━━━━━━〔 *${BOT_NAME} V10.44* 〕━━━━━━━⬣\n╰━━━━━━━━━━━━━━⬣`
const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb92SSa2Jl8JCFFLyP22"
const CHANNEL_NAME = "DANGER-MD OFFICIAL"

const app = express();
const server = createServer(app);
const io = new Server(server);

const db = new Low(new JSONFile('chatdb.json'));
await db.read();
db.data ||= { paired: [], pendingRequests: [], warns: {}, antibot: {}, antibadword: {}, antilink: {}, badwords: ['ngwa','mumu','idiot'], chatHistory: {} };
await db.write();

// ========== SESSIONS USING LOWDB ==========
async function addSession(number) {
  await db.read();
  db.data.sessions ||= [];
  if(!db.data.sessions.find(s => s.number === number)) {
    db.data.sessions.push({number, status: 'waiting', code: null, created_at: new Date().toISOString()});
    await db.write();
  }
}
async function updateSession(status, code, number) {
  await db.read();
  const s = db.data.sessions.find(s => s.number === number);
  if(s) {s.status = status; s.code = code; await db.write();}
}
function getAllSessions() {
  return db.data.sessions || [];
}

function isMaster(jid){ return jidDecode(jid).user === MASTER; }
async function isPaired(num){ await db.read(); return db.data.paired.find(p => typeof p === 'object'? p.number === num : p === num); }

async function forwardChannelToGroups(sock, number) { /*... same as before... */ }
async function broadcastToAllGroups(sock, message) { /*... same as before... */ }

app.use(express.json());
app.use(express.static('public'));
app.get('/api/sessions', (req,res) => res.json(getAllSessions.all()));
app.post('/api/pair', async (req,res) => {const { number } = req.body; if(!number) return res.status(400).json({error: 'Number required'}); addSession.run(number); startSession(number); res.json({success: true})});
server.listen(PORT, () => console.log(`⚡ ${BOT_NAME} Panel running on port ${PORT}`));

const commands = new Map();
function cmd(name, level, desc, run) { commands.set(name, {level, desc, run}); }cmd('ai','all','Chat with AI', async(sock, msg, args) => {const prompt = args.join(' '); if(!prompt) return sock.sendMessage(msg.key.remoteJid, {text: `❌ Use: ${PREFIX}ai text`}); await sock.sendMessage(msg.key.remoteJid, {text: `${DIABLO_BANNER}\n\nYou: "${prompt}"\nBot: I'm ${BOT_NAME} AI.`})});
cmd('clear','all','Clear AI chat', async(sock, msg) => {const sender = jidDecode(msg.key.participant || msg.key.remoteJid).user; await db.read(); db.data.chatHistory[sender] = []; await db.write(); await sock.sendMessage(msg.key.remoteJid, {text: `✅ Cleared`})});
cmd('menu','all','Show menu', async(s,m)=>s.sendMessage(m.key.remoteJid,{text:`${DIABLO_BANNER}\n\n*GUEST:*.ai.clear.menu.help.requestpair\n*GROUP ADMIN:*.play.audio.video.download.kick.ban.promote.demote.add.tagall.mute.unmute.group.warn.del.promoteall.demoteall.antibot.antibadword.antilink\n*PAIRED:*.play.audio.video.download.pair.channel\n*MASTER:*.approve.deny.pending.pairedlist.unpair.broadcastchannel\n*FOLLOW OUR CHANNEL:* ${CHANNEL_LINK}`)});
cmd('help','all','List commands', async(s,m)=>s.sendMessage(m.key.remoteJid,{text:`${DIABLO_BANNER}\n\n*GROUP ADMIN:*.play.download.kick.ban.promote.demote.add.tagall.mute.unmute.group.warn.del.promoteall.demoteall.antibot.antibadword.antilink\n*PAIRED:*.channel\n*MASTER:*.broadcastchannel`}));
cmd('channel','all','Get channel link', async(sock, msg) => {await sock.sendMessage(msg.key.remoteJid, {text: `*FOLLOW ${CHANNEL_NAME}*`,contextInfo: {externalAdReply: {title: CHANNEL_NAME,body: "Scripts • Updates • Codes",mediaType: 1,thumbnailUrl: "https://i.imgur.com/8Km9tLL.png",sourceUrl: CHANNEL_LINK}}}})});
cmd('download','paired','Download', async(sock, msg, args) => {const from = msg.key.remoteJid; const type = args[0]; const query = args.slice(1).join(' '); if(!type ||!query) return sock.sendMessage(from, {text: `❌ Use: ${PREFIX}download video|audio name`}); try {const search = await yts(query); const video = search.videos[0]; const filePath = `./tmp/${video.videoId}.${type==='video'?'mp4':'mp3'}`; if(!fs.existsSync('./tmp')) fs.mkdirSync('./tmp'); await streamPipeline(ytdl(video.url, { filter: type==='audio'?'audioonly':undefined }), fs.createWriteStream(filePath)); await sock.sendMessage(from, type==='video'?{video:{url:filePath}} :{audio:{url:filePath},mimetype:'audio/mpeg'}); fs.unlinkSync(filePath);} catch(e) { await sock.sendMessage(from, {text: `❌ Error`}); }});
cmd('video','paired','Download video', async(sock, msg, args) => commands.get('download').run(sock, msg, ['video',...args]));
cmd('audio','paired','Download audio', async(sock, msg, args) => commands.get('download').run(sock, msg, ['audio',...args]));
cmd('play','paired','Play music', async(sock, msg, args) => commands.get('download').run(sock, msg, ['audio',...args]));
cmd('promote','groupadmin','Make admin', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return sock.sendMessage(from, {text: `❌ Use in group`}); const target = msg.message.extendedTextMessage?.contextInfo?.participant[0] || args[0]?.replace(/\D/g,'') + '@s.whatsapp.net'; await sock.groupParticipantsUpdate(from, [target], "promote"); await sock.sendMessage(from, {text: `✅ Promoted`, mentions: [target]})});
cmd('demote','groupadmin','Demote admin', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return sock.sendMessage(from, {text: `❌ Use in group`}); const target = msg.message.extendedTextMessage?.contextInfo?.participant[0] || args[0]?.replace(/\D/g,'') + '@s.whatsapp.net'; await sock.groupParticipantsUpdate(from, [target], "demote"); await sock.sendMessage(from, {text: `✅ Demoted`, mentions: [target]})});
cmd('promoteall','groupadmin','Promote all', async(sock, msg) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; const metadata = await sock.groupMetadata(from); const targets = metadata.participants.filter(p =>!p.admin).map(p => p.id); await sock.groupParticipantsUpdate(from, targets, "promote"); await sock.sendMessage(from, {text: `✅ Promoted ${targets.length}`})});
cmd('demoteall','groupadmin','Demote all', async(sock, msg) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; const metadata = await sock.groupMetadata(from); const sender = msg.key.participant || msg.key.remoteJid; const targets = metadata.participants.filter(p => p.admin === 'admin' && p.id!== sender).map(p => p.id); await sock.groupParticipantsUpdate(from, targets, "demote"); await sock.sendMessage(from, {text: `✅ Demoted ${targets.length}`})});
cmd('kick','groupadmin','Kick', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; const target = msg.message.extendedTextMessage?.contextInfo?.participant[0] || args[0]?.replace(/\D/g,'') + '@s.whatsapp.net'; await sock.groupParticipantsUpdate(from, [target], "remove"); await sock.sendMessage(from, {text: `✅ Kicked`, mentions: [target]})});
cmd('ban','groupadmin','Ban', async(sock, msg, args) => commands.get('kick').run(sock, msg, args));
cmd('add','groupadmin','Add', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; const number = args[0]?.replace(/\D/g,'') + '@s.whatsapp.net'; await sock.groupParticipantsUpdate(from, [number], "add"); await sock.sendMessage(from, {text: `✅ Added`, mentions: [number]})});
cmd('tagall','groupadmin','Tag all', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; const metadata = await sock.groupMetadata(from); const participants = metadata.participants.map(p => p.id); const message = args.join(' ') || 'Attention!'; await sock.sendMessage(from, {text: `📢 *${message}*\n\n${participants.map(p => `@${p.split('@')[0]}`).join(' ')}`, mentions: participants})});
cmd('del','groupadmin','Delete msg', async(sock, msg) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; const quoted = msg.message.extendedTextMessage?.contextInfo?.stanzaId; if(!quoted) return; await sock.sendMessage(from, {delete: {remoteJid: from, id: quoted, fromMe: false}})});
cmd('warn','groupadmin','Warn user', async(sock, msg, args) => {const from = msg.key.remoteJid; const target = msg.message.extendedTextMessage?.contextInfo?.participant[0] || args[0]?.replace(/\D/g,'') + '@s.whatsapp.net'; if(!target) return; const reason = args.slice(1).join(' ') || 'No reason'; await db.read(); db.data.warns[target] = (db.data.warns[target] || 0) + 1; await db.write(); const count = db.data.warns[target]; await sock.sendMessage(from, {text: `⚠️ *WARN ${count}/10*\n*User:* @${target.split('@')[0]}\n*Reason:* ${reason}`, mentions: [target]}); if(count >= 10) {await sock.groupParticipantsUpdate(from, [target], "remove"); await sock.sendMessage(from, {text: `❌ @${target.split('@')[0]} kicked after 10 warns`, mentions: [target]}); db.data.warns[target] = 0; await db.write();}});
cmd('mute','groupadmin','Close group', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; await sock.groupSettingUpdate(from, 'announcement'); await sock.sendMessage(from, {text: `🔒 Group Closed`}); const time = args[0]; if(time) {let ms = 0; if(time.endsWith('s')) ms = parseInt(time) * 1000; if(time.endsWith('m')) ms = parseInt(time) * 60000; if(time.endsWith('h')) ms = parseInt(time) * 3600000; if(ms > 0) {await sock.sendMessage(from, {text: `⏰ Auto-open in: ${time}`}); setTimeout(async () => {await sock.groupSettingUpdate(from, 'not_announcement'); await sock.sendMessage(from, {text: `🔓 Group Opened`})}, ms)}}});
cmd('unmute','groupadmin','Open group', async(sock, msg) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; await sock.groupSettingUpdate(from, 'not_announcement'); await sock.sendMessage(from, {text: `🔓 Group Opened`})});
cmd('group','groupadmin','Group open/close', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; const action = args[0]; const time = args[1]; if(action === 'close') return commands.get('mute').run(sock, msg, [time]); if(action === 'open') return commands.get('unmute').run(sock, msg, []); await sock.sendMessage(from, {text: `❌ Use: ${PREFIX}group open | ${PREFIX}group close 30m`})});
cmd('antibot','groupadmin','Toggle antibot', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; await db.read(); db.data.antibot ||= {}; if(args[0] === 'on') {db.data.antibot[from] = true; await db.write(); return sock.sendMessage(from, {text: `🛡️ ANTIBOT ON`})} if(args[0] === 'off') {db.data.antibot[from] = false; await db.write(); return sock.sendMessage(from, {text: `❌ ANTIBOT OFF`})} await sock.sendMessage(from, {text: `🛡️ ANTIBOT: ${db.data.antibot[from]? 'ON' : 'OFF'}`})});
cmd('antibadword','groupadmin','Toggle antibadword', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; await db.read(); db.data.antibadword ||= {}; if(args[0] === 'on') {db.data.antibadword[from] = true; await db.write(); return sock.sendMessage(from, {text: `🚫 ANTIBADWORD ON\nBad words: ${db.data.badwords.join(', ')}`})} if(args[0] === 'off') {db.data.antibadword[from] = false; await db.write(); return sock.sendMessage(from, {text: `✅ ANTIBADWORD OFF`})} await sock.sendMessage(from, {text: `🚫 ANTIBADWORD: ${db.data.antibadword[from]? 'ON' : 'OFF'}`})});
cmd('antilink','groupadmin','Toggle antilink', async(sock, msg, args) => {const from = msg.key.remoteJid; if(!from.endsWith('@g.us')) return; await db.read(); db.data.antilink ||= {}; if(args[0] === 'on') {db.data.antilink[from] = true; await db.write(); return sock.sendMessage(from, {text: `🔗 ANTILINK ON\nWhatsApp/Telegram links will be deleted`})} if(args[0] === 'off') {db.data.antilink[from] = false; await db.write(); return sock.sendMessage(from, {text: `✅ ANTILINK OFF`})} await sock.sendMessage(from, {text: `🔗 ANTILINK: ${db.data.antilink[from]? 'ON' : 'OFF'}`})});
cmd('pair','all','Generate code', async(sock, msg, args) => {const from = msg.key.remoteJid; const sender = jidDecode(msg.key.participant || msg.key.remoteJid).user; let isGroupAdmin = false; if(from.endsWith('@g.us')){const metadata = await sock.groupMetadata(from); const participant = metadata.participants.find(p => p.id.includes(sender)); isGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';} const canPair = isGroupAdmin || isMaster(sender) || await isPaired(sender); if(!canPair) return sock.sendMessage(from, {text: `❌ No permission`}); let number = args[0] || sender; number = number.replace(/\D/g,''); const code = await sock.requestPairingCode(number); await sock.sendMessage(from, {text: `${DIABLO_BANNER}\n\n*CODE:* \`\`${code}\`\`\n\n*FOLLOW:* ${CHANNEL_LINK}`}); await db.read(); if(!await isPaired(number)){db.data.paired.push({number: number, pairedBy: sender, time: new Date().toISOString()}); await db.write(); forwardChannelToGroups(sock, number);}});
cmd('requestpair','all','Request pair', async(sock, msg) => {const sender = jidDecode(msg.key.participant || msg.key.remoteJid).user; await db.read(); if(await isPaired(sender) || isMaster(sender)) return; db.data.pendingRequests.push({number:sender}); await db.write(); await sock.sendMessage(`${MASTER}@s.whatsapp.net`, {text: `NEW REQUEST: 234${sender}`})});
cmd('pending','master','Pending', async(sock, msg) => {await db.read(); await sock.sendMessage(msg.key.remoteJid, {text: `Pending: ${db.data.pendingRequests.length}`})});
cmd('pairedlist','master','Paired list', async(sock, msg) => {await db.read(); await sock.sendMessage(msg.key.remoteJid, {text: `Paired: ${db.data.paired.length}`})});
cmd('approve','master','Approve', async(sock, msg, args) => {const number = args[0]?.replace(/\D/g,''); await db.read(); if(!await isPaired(number)) {db.data.paired.push({number: number, pairedBy: MASTER}); await db.write(); forwardChannelToGroups(sock, number);} db.data.pendingRequests = db.data.pendingRequests.filter(r => r.number!== number); await db.write();});
cmd('deny','master','Deny', async(sock, msg, args) => {const number = args[0]?.replace(/\D/g,''); await db.read(); db.data.pendingRequests = db.data.pendingRequests.filter(r => r.number!== number); await db.write();});
cmd('unpair','master','Unpair', async(s,m,args)=>{const num=args[0].replace(/\D/g,''); await db.read(); db.data.paired=db.data.paired.filter(p=> typeof p === 'object'? p.number!== num : p!== num); await db.write();});
cmd('broadcastchannel','master','Broadcast to all groups', async(sock, msg, args) => {const text = args.join(' '); if(!text) return sock.sendMessage(msg.key.remoteJid, {text: `❌ Use: ${PREFIX}broadcastchannel We are fixing a bug`}); await broadcastToAllGroups(sock, text);});
for(let i=1;i<=180;i++){ cmd(`cmd${i}`,'paired',`Utility ${i}`, async(s,m)=>s.sendMessage(m.key.remoteJid,{text:`Cmd ${i}`}))}const sessions = new Map();
async function startSession(number) {
    const sessionPath = `auth_info/${number}`;
    if(!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, {recursive: true});
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const sock = makeWASocket({logger: pino({level: 'silent'}), auth: state, browser: Browsers.macOS('Desktop')});
    sessions.set(number, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'open') {updateSession.run('connected', null, number); await broadcastToAllGroups(sock, `✅ Bot 234${number} is ONLINE and running v10.44`);}
        if(connection === 'close') {sessions.delete(number); const reason = lastDisconnect?.error?.output?.statusCode; await broadcastToAllGroups(sock, `⚠️ Bot 234${number} went OFFLINE. Reason: ${reason}. Restarting...`); if(reason!== DisconnectReason.loggedOut) startSession(number)}
        if(!state.creds.registered) {const code = await sock.requestPairingCode(number); updateSession.run('waiting', code, number)}
    });

    sock.ev.on('messages.upsert', async ({messages}) => {
        const msg = messages[0]; if(!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid; const senderNum = jidDecode(sender).user;

        if(from.endsWith('@g.us')){await db.read(); if(db.data.antilink?.[from] && (text.includes('chat.whatsapp.com') || text.includes('t.me'))) {await sock.sendMessage(from, {delete: {remoteJid: from, id: msg.key.id, fromMe: false}}); await sock.sendMessage(from, {text: `🔗 @${senderNum} Link not allowed`, mentions: [sender]});} if(db.data.antibadword?.[from]) {const foundBad = db.data.badwords.find(word => text.toLowerCase().includes(word)); if(foundBad) {await sock.sendMessage(from, {delete: {remoteJid: from, id: msg.key.id, fromMe: false}}); await sock.sendMessage(from, {text: `🚫 @${senderNum} Bad word detected: "${foundBad}"`, mentions: [sender]}); commands.get('warn').run(sock, msg, [senderNum, `Bad word: ${foundBad}`]);}}}

        if(!text.startsWith(PREFIX)) return;
        const args = text.slice(PREFIX.length).trim().split(/ +/);
        const cmdName = args.shift().toLowerCase(); const command = commands.get(cmdName); if(!command) return;

        await db.read();
        const isPairedUser = await isPaired(senderNum);
        const isMasterUser = isMaster(sender);
        const isAdminUser = ADMINS.includes(senderNum);
        let isGroupAdmin = false;
        if(from.endsWith('@g.us')){try {const metadata = await sock.groupMetadata(from); const participant = metadata.participants.find(p => p.id.includes(senderNum)); isGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';} catch(e) {}}
        if(command.level === 'master' &&!isMasterUser) return sock.sendMessage(from, {text: `❌ Only MASTER`});
        if(command.level === 'groupadmin' &&!isMasterUser &&!isGroupAdmin) return sock.sendMessage(from, {text: `❌ Only Group Admins + MASTER`});
        if(command.level === 'paired' &&!isMasterUser &&!isPairedUser &&!isAdminUser &&!isGroupAdmin) return sock.sendMessage(from, {text: `❌ Only Group Admins + PAIRED + MASTER`});
        await command.run(sock, msg, args);
    });

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        if(action === 'add') {await db.read(); if(db.data.antibot?.[id]) {for(const participant of participants) {const userNum = jidDecode(participant).user; const isBot = userNum.length > 12 &&!userNum.startsWith(MASTER); if(isBot) {await sock.groupParticipantsUpdate(id, [participant], "remove"); await sock.sendMessage(id, {text: `🛡️ ANTIBOT: Kicked bot @${userNum}`, mentions: [participant]}); await sock.sendMessage(`${MASTER}@s.whatsapp.net`, {text: `${DIABLO_BANNER}\n\n🚨 BOT KICKED\n*Group:* ${(await sock.groupMetadata(id)).subject}\n*Bot:* 234${userNum}`});}}}}
        if(action === 'promote') {await db.read(); for(const participant of participants) {const userNum = jidDecode(participant).user; const isPairedUser = await isPaired(userNum); if(isPairedUser && userNum!== MASTER) {const groupName = (await sock.groupMetadata(id)).subject; await sock.sendMessage(`${MASTER}@s.whatsapp.net`, {text: `${DIABLO_BANNER}\n\n🚨 ALERT: 234${userNum} became ADMIN in ${groupName}`}); try {await sock.groupParticipantsUpdate(id, [`${MASTER}@s.whatsapp.net`], "add")} catch(e) {}}}}
    });
}

setInterval(() => {console.log(`${BOT_NAME} alive - ${new Date().toLocaleString()}`)}, 300000)
console.log(`⚡ ${BOT_NAME} Started Successfully`)