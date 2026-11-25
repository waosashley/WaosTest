const { spawn, execFileSync } = require('child_process');
const fs = require('fs');

function findBin(names) {
  for (const n of names) {
    try {
      execFileSync(n, ['-version'], { stdio: 'ignore' });
      return n;
    } catch (e) {}
  }
  return null;
}

const FFMPEG = findBin(['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']);

function runFFmpeg(args, inputPath) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error('ffmpeg no está instalado'));
    const p = spawn(FFMPEG, ['-y', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); if (err.length > 8000) err = err.slice(-4000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err.slice(-500) || `ffmpeg exit ${code}`)));
    if (inputPath && inputPath !== '-') {
      fs.createReadStream(inputPath).on('error', reject).pipe(p.stdin);
    } else if (inputPath === '-') {
      p.stdin.end();
    }
  });
}

module.exports = { FFMPEG, runFFmpeg };
