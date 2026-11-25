const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const U = require('./lib/utils');
const Trivia = require('./lib/trivia');
const Roulette = require('./lib/ruleta');
const Conecta4 = require('./lib/conecta4');
const Ajedrez = require('./lib/ajedrez');
const Battleship = require('./lib/battleship');
const Akinator = require('./lib/akinator');
const Scheduler = require('./lib/scheduler');

// ---------- Plugins ----------
const plugins = new Map();
const pluginsDir = path.join(__dirname, 'plugins');
for (const file of fs.readdirSync(pluginsDir)) {
  if (!file.endsWith('.js')) continue;
  try {
    const plugin = require(path.join(pluginsDir, file));
    if (!plugin.name || typeof plugin.run !== 'function') {
      console.warn(`[PLUGIN] ${file} sin name/run, ignorado`);
      continue;
    }
    const names = [plugin.name, ...(plugin.aliases || [])].map(n => n.toLowerCase());
    for (const n of names) plugins.set(n, plugin);
    console.log(`[PLUGIN] ${file} → ${names.join(', ')}`);
  } catch (e) {
    console.error(`[PLUGIN] Error cargando ${file}:`, e.message);
  }
}

const passiveHandlers = [
  Trivia.checkAnswer,
  Roulette.handleBang,
  Roulette.handleApproval,
  Conecta4.handleMove,
  Ajedrez.handleMove,
  Battleship.handleShot,
  Akinator.handleAnswer,
];

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version, auth: state, printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['BotAdmin', 'Chrome', '1.0.0'],
  });

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { console.log('\n📲 Escanea este QR:\n'); qrcode.generate(qr, { small: true }); }
    if (connection === 'open') {
      console.log('✅ Conectado como', sock.user?.id);
      Scheduler.attach(sock);
    }
    if (connection === 'close') {
      const rc = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (rc) startBot(); else console.log('❌ Sesión cerrada.');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const groupJid = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    // Chat privado: colocación de barcos de la batalla naval
    if (!groupJid?.endsWith('@g.us')) {
      if (text) {
        const phrase = process.env.OWNER_PHRASE;
        if (phrase && text.trim().toLowerCase() === phrase.toLowerCase()) {
          U.addBotOwner(msg.key.remoteJid, msg.key.remoteJidAlt);
          try { await sock.sendMessage(groupJid, { text: '✅ Acceso de dueña activado.' }, { quoted: msg }); }
          catch (e) { console.error('[OWNER]', e); }
          return;
        }
        try { await Battleship.handlePrivate(sock, msg, text); }
        catch (e) { console.error('[PRIVATE]', e); }
      }
      return;
    }

    const senderJid = U.getSenderJid(msg);

    if (U.mutedUsers[`${groupJid}:${senderJid}`]) {
      try { await sock.sendMessage(groupJid, { delete: msg.key }); } catch (e) {}
      return;
    }

    let commandText = null;
    let mentionOverride = null;

    if (msg.message.stickerMessage?.fileSha256) {
      const fileSha = U.hashToHex(msg.message.stickerMessage.fileSha256);
      const ctx = msg.message.stickerMessage?.contextInfo;
      if (U.bannedStickers[fileSha]) {
        try { await sock.sendMessage(groupJid, { delete: msg.key }); } catch (e) {}
        return;
      }
      let entry = U.stickerCommands[fileSha] || null;
      if (!entry && ctx?.quotedMessage) {
        try {
          const buffer = await U.downloadStickerBuffer(msg.message.stickerMessage);
          const ch = U.sha256Hex(buffer);
          if (U.stickerCommands[ch]) entry = U.stickerCommands[ch];
          if (U.bannedStickers[ch]) {
            try { await sock.sendMessage(groupJid, { delete: msg.key }); } catch (e) {}
            return;
          }
        } catch (e) {}
      }
      if (entry) {
        commandText = entry.cmd;
        if (ctx?.participant) mentionOverride = ctx.participant;
      }
    }

    if (text) {
      const userBanned = U.bannedWords[`${groupJid}:${senderJid}`] || [];
      if (userBanned.length > 0) {
        const nt = U.normalizeText(text);
        if (userBanned.some(w => nt.includes(U.normalizeText(w)))) {
          try { await sock.sendMessage(groupJid, { delete: msg.key }); } catch (e) {}
          return;
        }
      }
    }

    // ---------- Handlers pasivos (trivia, bang, columna) ----------
    if (text) {
      for (const handler of passiveHandlers) {
        try {
          if (await handler(sock, groupJid, senderJid, msg, text)) return;
        } catch (e) { console.error('[PASSIVE]', e); }
      }
    }

    if (!commandText && (text.startsWith('!') || text.startsWith('.'))) commandText = text;
    if (!commandText) return;

    const command = commandText.slice(1).split(' ')[0].toLowerCase();
    const args = commandText.slice(1).split(' ').slice(1);
    const plugin = plugins.get(command);
    if (!plugin) return;

    if (U.blockedCmds[groupJid]?.includes(plugin.name)) {
      const blockedMsg = U.blockedCmdMsgs[groupJid]?.[plugin.name];
      if (blockedMsg) {
        try { await sock.sendMessage(groupJid, { text: blockedMsg }, { quoted: msg }); }
        catch (e) { console.error('[BLOCKED]', e); }
      }
      return;
    }

    const isAdmin = await U.isSenderAdmin(sock, groupJid, senderJid);
    if (!isAdmin && !plugin.public) return;

    const reply = (content, opts = {}) => sock.sendMessage(groupJid, content, { quoted: msg, ...opts });

    const ctx = {
      sock, msg, groupJid, senderJid, senderPn: msg.key.participantAlt || null, isAdmin, args, commandText, command, reply, plugins,
      getTarget: () => {
        if (mentionOverride) return mentionOverride;
        const mentioned = U.getMentionedJid(msg);
        if (mentioned) return mentioned;
        const c = msg.message?.extendedTextMessage?.contextInfo || msg.message?.stickerMessage?.contextInfo;
        return c?.participant || null;
      },
    };

    try { await plugin.run(ctx); }
    catch (e) { console.error(`[PLUGIN ${command}]`, e); }
  });
}

startBot().catch(e => console.error('Error fatal:', e));