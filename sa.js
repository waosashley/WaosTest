import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    proto,
    downloadMediaMessage,
    downloadContentFromMessage
} from "baileys";
import {
    createTranslator,
    findMediaMessage,
    getCachedMetadata,
    getUserLanguage,
    logger,
    paths,
    professionalResponse,
    resolveBotJid,
    resolveBotName,
    style
} from "@blackasta/workspace";
import {
    buildSticker,
    getStickerMetadata,
    stickerAuthor
} from "../../../services/media/index.js";
import wa from "../../../lib/whatsapp/messages.js";

const execFileAsync = promisify(execFile);
const ICONS = style.icons;
const DURACION_MAXIMA = 10;

// Caché global compartida: guarda los audios de cualquier sticker con sonido entrante por su mensaje ID
if (!globalThis.__audioStickersCache) {
    globalThis.__audioStickersCache = new Map();
}
const audioStickersCache = globalThis.__audioStickersCache;

// Sesiones por usuario: puede guardar { oggBuffer } (audio primero) o { visual } (sticker/imagen primero)
if (!globalThis.__audioStickerSessions) {
    globalThis.__audioStickerSessions = new Map();
}
const sesiones = globalThis.__audioStickerSessions;

function modificarProto(p) {
    const M = p?.Message;
    if (!M || M.__audioStickerPatchedV3) return;
    if (M.StickerMessage) {
        const codificarStickerAnterior = M.StickerMessage.encode;
        M.StickerMessage.encode = function (mensaje, writer) {
            const audio = mensaje?.audioMessage;
            if (audio && Object.prototype.hasOwnProperty.call(mensaje, "audioMessage")) {
                delete mensaje.audioMessage;
            }
            const w = codificarStickerAnterior.call(this, mensaje, writer);
            if (audio && M.AudioMessage) {
                mensaje.audioMessage = audio;
                M.AudioMessage.encode(audio, w.uint32(210).fork()).ldelim();
            }
            return w;
        };
        if (typeof M.StickerMessage.fromObject === "function") {
            const convertirStickerAnterior = M.StickerMessage.fromObject;
            M.StickerMessage.fromObject = function (objeto) {
                const mensaje = convertirStickerAnterior.call(this, objeto);
                if (objeto?.audioMessage) {
                    mensaje.audioMessage = M.AudioMessage?.fromObject
                        ? M.AudioMessage.fromObject(objeto.audioMessage)
                        : objeto.audioMessage;
                }
                return mensaje;
            };
        }
    }
    const codificarMensajeAnterior = M.encode;
    M.encode = function (mensaje, writer) {
        const audioSticker = mensaje?.audioStickerMessage;
        if (audioSticker) {
            if (Object.prototype.hasOwnProperty.call(mensaje, "stickerMessage")) delete mensaje.stickerMessage;
            if (Object.prototype.hasOwnProperty.call(mensaje, "audioStickerMessage")) delete mensaje.audioStickerMessage;
        }
        const w = codificarMensajeAnterior.call(this, mensaje, writer);
        if (audioSticker && M.FutureProofMessage) {
            mensaje.audioStickerMessage = audioSticker;
            M.FutureProofMessage.encode(audioSticker, w.uint32(1074).fork()).ldelim();
        }
        return w;
    };
    if (typeof M.fromObject === "function") {
        const convertirMensajeAnterior = M.fromObject;
        M.fromObject = function (objeto) {
            const mensaje = convertirMensajeAnterior.call(this, objeto);
            if (objeto?.audioStickerMessage) {
                const interno = objeto.audioStickerMessage.message || objeto.audioStickerMessage;
                if (interno?.stickerMessage && objeto.audioStickerMessage.message?.stickerMessage?.audioMessage) {
                    interno.stickerMessage.audioMessage = objeto.audioStickerMessage.message.stickerMessage.audioMessage;
                }
                mensaje.audioStickerMessage = { message: interno };
                delete mensaje.stickerMessage;
                if (interno) Object.setPrototypeOf(mensaje, interno);
            }
            return mensaje;
        };
    }
    M.__audioStickerPatchedV3 = true;
}

async function asegurarModificado() {
    modificarProto(proto);
    try {
        const modulo = await import("baileys");
        if (modulo?.proto) modificarProto(modulo.proto);
        if (modulo?.default?.proto) modificarProto(modulo.default.proto);
    } catch {}
}

function audioDe(m) {
    const raw = m?.message || m;
    const st = raw?.audioStickerMessage?.message?.stickerMessage
            || raw?.stickerMessage
            || raw?.ephemeralMessage?.message?.audioStickerMessage?.message?.stickerMessage
            || raw?.ephemeralMessage?.message?.stickerMessage
            || raw?.viewOnceMessageV2?.message?.audioStickerMessage?.message?.stickerMessage
            || raw?.viewOnceMessageV2?.message?.stickerMessage;
    return st?.audioMessage || null;
}

async function convertirAOggOpus(buffer, extension = "mp3") {
    const idTemporal = randomBytes(6).toString("hex");
    const rutaEntrada = path.join(os.tmpdir(), `ptt_in_${idTemporal}.${extension}`);
    const rutaSalida = path.join(os.tmpdir(), `ptt_out_${idTemporal}.ogg`);
    try {
        await fs.writeFile(rutaEntrada, buffer);
        await execFileAsync("ffmpeg", [
            "-y", "-i", rutaEntrada,
            "-vn", "-map", "0:a:0",
            "-t", String(DURACION_MAXIMA),
            "-af", "aresample=48000:async=1:first_pts=0",
            "-c:a", "libopus", "-b:a", "64k", "-vbr", "on",
            "-compression_level", "10", "-ac", "1", "-ar", "48000",
            "-application", "audio", "-avoid_negative_ts", "make_zero",
            "-f", "ogg", rutaSalida
        ]);
        const bufferOgg = await fs.readFile(rutaSalida);
        if (!bufferOgg || bufferOgg.length < 200) throw new Error("Audio vacío o inválido.");
        return bufferOgg;
    } finally {
        await fs.unlink(rutaEntrada).catch(() => {});
        await fs.unlink(rutaSalida).catch(() => {});
    }
}

async function extraerAudioDeVideo(videoBuffer) {
    const idTemporal = randomBytes(6).toString("hex");
    const rutaEntrada = path.join(os.tmpdir(), `vid_in_${idTemporal}.mp4`);
    const rutaSalida = path.join(os.tmpdir(), `vid_audio_${idTemporal}.ogg`);
    try {
        await fs.writeFile(rutaEntrada, videoBuffer);
        await execFileAsync("ffmpeg", [
            "-y", "-i", rutaEntrada,
            "-vn", "-map", "0:a:0",
            "-t", String(DURACION_MAXIMA),
            "-af", "aresample=48000:async=1:first_pts=0",
            "-c:a", "libopus", "-b:a", "64k", "-vbr", "on",
            "-compression_level", "10", "-ac", "1", "-ar", "48000",
            "-application", "audio", "-avoid_negative_ts", "make_zero",
            "-f", "ogg", rutaSalida
        ]);
        const bufferOgg = await fs.readFile(rutaSalida);
        if (!bufferOgg || bufferOgg.length < 200) return null;
        return bufferOgg;
    } catch {
        return null;
    } finally {
        await fs.unlink(rutaEntrada).catch(() => {});
        await fs.unlink(rutaSalida).catch(() => {});
    }
}

function crearExif(packname, author) {
    const json = {
        "sticker-pack-id": "com.blackasta.audiosticker",
        "sticker-pack-name": String(packname ?? "BlackAsta"),
        "sticker-pack-publisher": String(author ?? "BlackAsta"),
        emojis: ["🔊"]
    };
    const atributoExif = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const bufferJson = Buffer.from(JSON.stringify(json), "utf-8");
    const exif = Buffer.concat([atributoExif, bufferJson]);
    exif.writeUIntLE(bufferJson.length, 14, 4);
    return exif;
}

function reemplazarExifEnWebp(webpBuffer, packname, author) {
    if (!Buffer.isBuffer(webpBuffer) || webpBuffer.length < 16 || webpBuffer.toString("ascii", 0, 4) !== "RIFF" || webpBuffer.toString("ascii", 8, 12) !== "WEBP") {
        return webpBuffer;
    }
    const datosExif = crearExif(packname, author);
    const fragmentos = [];
    let offset = 12;
    let tieneVp8x = false;
    let esAnimado = false;

    while (offset + 8 <= webpBuffer.length) {
        const id = webpBuffer.toString("ascii", offset, offset + 4);
        const size = webpBuffer.readUInt32LE(offset + 4);
        const acolchado = size + (size % 2);
        const final = Math.min(webpBuffer.length, offset + 8 + acolchado);
        const fragmento = Buffer.from(webpBuffer.subarray(offset, final));
        if (id === "VP8X") tieneVp8x = true;
        if (id === "ANIM" || id === "ANMF") esAnimado = true;
        if (id !== "EXIF") fragmentos.push({ id, fragmento });
        offset = final;
    }

    if (!tieneVp8x) {
        const vp8x = Buffer.alloc(18);
        vp8x.write("VP8X", 0, 4, "ascii");
        vp8x.writeUInt32LE(10, 4);
        vp8x[8] = 0x18;
        vp8x.writeUIntLE(511, 12, 3);
        vp8x.writeUIntLE(511, 15, 3);
        fragmentos.unshift({ id: "VP8X", fragmento: vp8x });
    } else {
        const entradaVp8x = fragmentos.find((f) => f.id === "VP8X");
        if (entradaVp8x && entradaVp8x.fragmento.length >= 18) {
            entradaVp8x.fragmento[8] |= 0x08;
            if (esAnimado) entradaVp8x.fragmento[8] |= 0x02;
        }
    }

    const byteRelleno = datosExif.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
    const encabezadoExif = Buffer.alloc(8);
    encabezadoExif.write("EXIF", 0, 4, "ascii");
    encabezadoExif.writeUInt32LE(datosExif.length, 4);
    fragmentos.push({ id: "EXIF", fragmento: Buffer.concat([encabezadoExif, datosExif, byteRelleno]) });

    const cuerpo = Buffer.concat(fragmentos.map((f) => f.fragmento));
    const encabezado = Buffer.alloc(12);
    encabezado.write("RIFF", 0, 4, "ascii");
    encabezado.writeUInt32LE(cuerpo.length + 4, 4);
    encabezado.write("WEBP", 8, 4, "ascii");
    return Buffer.concat([encabezado, cuerpo]);
}

/**
 * Enviar sticker con sonido nativo
 */
async function enviarStickerSonido(sock, jid, webpBuffer, oggBuffer, seconds = 5, quotedMsg) {
    await asegurarModificado();
    const opts = { upload: sock.waUploadToServer };

    const st = await prepareWAMessageMedia({ sticker: webpBuffer }, opts);
    const au = await prepareWAMessageMedia(
        { audio: oggBuffer, mimetype: "audio/ogg; codecs=opus", ptt: false },
        opts
    );

    const isAnim = webpBuffer.includes(Buffer.from("ANIM"));
    const stickerMessage = {
        ...st.stickerMessage,
        mimetype: "image/webp",
        width: 512,
        height: 512,
        isAnimated: isAnim,
        audioMessage: {
            ...au.audioMessage,
            mimetype: "audio/ogg; codecs=opus",
            ptt: false,
            seconds: Math.max(1, Math.min(DURACION_MAXIMA, Math.round(seconds)))
        }
    };

    const userJid = sock.user?.id || resolveBotJid(sock);
    const msg = generateWAMessageFromContent(
        jid,
        { audioStickerMessage: { message: { stickerMessage } } },
        { userJid, quoted: quotedMsg }
    );

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
}

export default {
    category: "Stickers",
    name: "stickeraudio",
    aliases: ["saudio", "sa", "stcaudio", "teststickeraudio", "tsaudio", "saudiotest"],
    description: "Crea stickers con audio nativo de WhatsApp.",
    queue: "media",
    meta: { offloadLane: "core", slowLane: false, riskLevel: "normal" },
    async handler({ sock, m, args, services, prefix: __prefix, commandName }) {
        const chat = m.chat || m.key.remoteJid;
        const sender = m.sender || m.key.participant || m.participant || chat;
        const p = __prefix || ".";
        const usedCmd = String(commandName || "sa").toLowerCase();
        const claveSesion = `${chat}:${sender}`;
        const header = style.lineHeader("Sticker Con Audio");
        const responder = (texto) => professionalResponse(sock, m, `${header}\n\n${texto}`, [sender], { quoted: m, linkPreview: false });

        const language = await getUserLanguage(sender);
        const { t } = createTranslator(language);
        const db = services?.resolve?.("db") || null;
        const botJid = resolveBotJid(sock);
        const botname = await resolveBotName({ sock, db, botJid });
        const metadata = m.metadata || await getCachedMetadata(sock, chat);
        const groupname = metadata?.subject || "Grupo";

        await asegurarModificado();

        // Auto-caché: si el mensaje actual o citado trae audioMessage, guardarlo por su ID
        if (m.key?.id) {
            const liveAudio = audioDe(m.message);
            if (liveAudio) audioStickersCache.set(m.key.id, liveAudio);
        }
        if (m.quoted?.key?.id) {
            const liveQuotedAudio = audioDe(m.quoted.message);
            if (liveQuotedAudio) audioStickersCache.set(m.quoted.key.id, liveQuotedAudio);
        }

        const quoteObj = m.quoted ? { message: m.quoted.message, key: m.quoted.key } : { message: m.message, key: m.key };
        const logSilencioso = { logger: { info: () => {}, error: () => {}, warn: () => {} } };

        const obtenerPack = async () => {
            if (args?.length > 0) {
                const text = args.join(" ");
                if (text.includes("|")) {
                    const parts = text.split("|");
                    return {
                        packname: parts[0].trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 50) || "Sticker",
                        author: parts.slice(1).join("|").trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 50) || "User"
                    };
                }
                return {
                    packname: text.trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 50) || "Sticker",
                    author: stickerAuthor(m.pushName || "User", groupname)
                };
            }
            const stickerMeta = await getStickerMetadata({ sender, m, services, botname, pushName: m.pushName || "User", groupname });
            return { packname: stickerMeta.packname, author: stickerMeta.author };
        };

        // Convierte un visual (imagen/vídeo/sticker) en sticker y lo envía con el audio indicado
        const enviarVisualConAudio = async (visual, oggBuffer) => {
            const { packname, author } = await obtenerPack();
            const tmpDir = paths.TMP_DIR || os.tmpdir();
            const tempId = `stk_audio_${Date.now()}`;
            const ext = visual.ext;
            const inputPath = path.join(tmpDir, `${tempId}.${ext}`);
            await fs.writeFile(inputPath, visual.buffer);
            try {
                const stickerFinal = await buildSticker(inputPath, {
                    type: visual.isAnim ? "video" : "image",
                    packname,
                    author,
                    packId: "blackasta.sticker.sys"
                });
                await enviarStickerSonido(sock, chat, stickerFinal, oggBuffer, 5, m);
            } finally {
                await fs.unlink(inputPath).catch(() => {});
            }
            sesiones.delete(claveSesion);
            try { await wa.send(sock, chat, { react: { text: "🔊", key: m.key } }); } catch {}
            logger.info({ chat, sender }, "[StickerAudio] Sticker con audio enviado exitosamente");
        };

        const foundAudioOnly = findMediaMessage(m, ["audioMessage"]);
        const foundVisual = findMediaMessage(m, ["imageMessage", "videoMessage", "ptvMessage", "stickerMessage"]);
        const isVideo = foundVisual && (foundVisual.key === "videoMessage" || foundVisual.downloadType === "video" || foundVisual.key === "ptvMessage");
        const isSticker = foundVisual && (foundVisual.key === "stickerMessage" || foundVisual.downloadType === "sticker");

        // CASO A: Se cita un audio o nota de voz
        if (foundAudioOnly && !foundVisual) {
            const rawAudio = await downloadMediaMessage(quoteObj, "buffer", {}, logSilencioso);
            if (!rawAudio || !rawAudio.length) {
                return responder(`${ICONS.error} No se pudo descargar el audio citado.`);
            }
            const oggBuffer = await convertirAOggOpus(rawAudio);

            // Si antes se envió primero un sticker/imagen, se combina ahora
            const sesion = sesiones.get(claveSesion);
            if (sesion?.visual) {
                try {
                    await wa.send(sock, chat, { react: { text: "⏳", key: m.key } });
                    await enviarVisualConAudio(sesion.visual, oggBuffer);
                } catch (err) {
                    sesiones.delete(claveSesion);
                    logger.error({ err }, "[StickerAudio] Error combinando audio con sticker previo");
                    try { await wa.send(sock, chat, { react: { text: "❌", key: m.key } }); } catch {}
                    return responder(`${ICONS.error} Error: ${err.message}`);
                }
                return;
            }

            sesiones.set(claveSesion, { oggBuffer, timestamp: Date.now() });
            return responder(
                `${ICONS.success} Audio guardado correctamente.\n\n` +
                `> ${ICONS.ejemplo} Ahora responde a una foto, vídeo o sticker con *${p}${usedCmd}*`
            );
        }

        // CASO B: No hay medio ni audio -> explicar las dos formas de uso
        if (!foundVisual) {
            return responder(
                `${ICONS.info} Crea un sticker con sonido de dos formas:\n\n` +
                `1️⃣ Responde a un *audio* con *${p}${usedCmd}* y luego responde a una *foto, vídeo o sticker* con *${p}${usedCmd}*.\n` +
                `2️⃣ Responde primero a una *foto, vídeo o sticker* con *${p}${usedCmd}* y luego responde a un *audio* con *${p}${usedCmd}*.\n\n` +
                `> Los vídeos usan su propio audio si no tienes uno guardado.`
            );
        }

        // CASO C: Medio visual (imagen, vídeo o sticker)
        try {
            await wa.send(sock, chat, { react: { text: "⏳", key: m.key } });

            const visualBuf = await downloadMediaMessage(quoteObj, "buffer", {}, logSilencioso);
            if (!visualBuf || !visualBuf.length) {
                throw new Error("No se pudo descargar el archivo visual.");
            }

            const mediaType = foundVisual.downloadType || "image";
            let ext = "png";
            if (isVideo) ext = "mp4";
            if (isSticker) ext = "webp";
            const visual = { buffer: visualBuf, ext, isAnim: ext === "mp4" || Boolean(foundVisual.media?.isAnimated), isVideo, isSticker };

            // 1. Audio guardado previamente en la sesión
            const sesion = sesiones.get(claveSesion);
            let oggAudioBuffer = sesion?.oggBuffer || null;

            // 2. Sticker citado con audio: se reempaqueta el webp con su audio
            if (isSticker && !oggAudioBuffer) {
                const idCitado = m.quoted?.key?.id || m.message?.extendedTextMessage?.contextInfo?.stanzaId;
                const cachedAudio = audioDe(m.quoted?.message) || (idCitado ? audioStickersCache.get(idCitado) : null);
                if (cachedAudio) {
                    try {
                        const stream = await downloadContentFromMessage(cachedAudio, "audio");
                        const chunks = [];
                        for await (const chunk of stream) chunks.push(chunk);
                        oggAudioBuffer = Buffer.concat(chunks);
                    } catch (e) {
                        logger.error({ err: e.message }, "[StickerAudio] Error descargando audio desde sticker cache");
                    }
                }
                if (oggAudioBuffer) {
                    const { packname, author } = await obtenerPack();
                    const stickerReempacado = reemplazarExifEnWebp(visualBuf, packname, author);
                    await enviarStickerSonido(sock, chat, stickerReempacado, oggAudioBuffer, 5, m);
                    sesiones.delete(claveSesion);
                    try { await wa.send(sock, chat, { react: { text: "🔊", key: m.key } }); } catch {}
                    logger.info({ chat, sender }, "[StickerAudio] Sticker con audio re-empacado exitosamente");
                    return;
                }
            }

            // 3. Vídeo sin audio guardado: usar el audio del propio vídeo
            if (isVideo && !oggAudioBuffer) {
                oggAudioBuffer = await extraerAudioDeVideo(visualBuf);
                if (!oggAudioBuffer) {
                    throw new Error("El vídeo citado no contiene audio. Responde primero a un audio con " + `${p}${usedCmd}.`);
                }
            }

            // 4. Sin audio: guardar el visual y esperar el audio (orden inverso)
            if (!oggAudioBuffer) {
                sesiones.set(claveSesion, { visual, timestamp: Date.now() });
                try { await wa.send(sock, chat, { react: { text: "🖼️", key: m.key } }); } catch {}
                return responder(
                    `${ICONS.success} Sticker guardado correctamente.\n\n` +
                    `> ${ICONS.ejemplo} Ahora responde a un *audio* con *${p}${usedCmd}* para combinarlos.`
                );
            }

            await enviarVisualConAudio(visual, oggAudioBuffer);
        } catch (err) {
            logger.error({ err }, "[StickerAudio] Error generando sticker con audio");
            try { await wa.send(sock, chat, { react: { text: "❌", key: m.key } }); } catch {}
            await responder(`${ICONS.error} Error: ${err.message}`);
        }
    }
};
