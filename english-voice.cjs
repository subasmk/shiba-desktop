const {DEFAULT_VOICE}=require('./eleven-voice.cjs');
// Retired language values migrate without deleting models or unrelated settings.
function migrateEnglish(settings){const s=settings&&typeof settings==='object'&&!Array.isArray(settings)?settings:{};s.voiceLang='en';if(s.englishVoiceVersion!==1){if(!s.elevenVoiceId)s.elevenVoiceId=DEFAULT_VOICE;if(!s.voiceEngine||s.voiceEngine==='kokoro')s.voiceEngine='elevenlabs';s.englishVoiceVersion=1;}return s;}
module.exports={migrateEnglish};
