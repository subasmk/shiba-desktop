// Regenerate the offline script after replacing relay-girl.riv.
const fs=require('node:fs');
const b64=fs.readFileSync('relay-girl.riv').toString('base64');
fs.writeFileSync('relay-girl-riv.js','// Generated from relay-girl.riv by tools/embed-riv.cjs\nwindow.RELAY_GIRL_RIV_B64='+JSON.stringify(b64)+';\n');
