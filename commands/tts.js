const axios = require('axios');

module.exports = {
  name: "tts",
  description: "Converts text to speech and sends audio.",
  async execute(senderId, args, pageAccessToken) {
    const apiKey = "89c5ef1017b147c9acf4e706d93e1125"; // Replace with your Voicerss API key
    const text = args.join(" ");

    if (!text) return "⚠️ | Please provide text to convert to speech.";

    try {
      const ttsUrl = `https://api.voicerss.org/?key=${apiKey}&hl=en-us&src=${encodeURIComponent(text)}&c=MP3&f=44khz_16bit_stereo`;

      await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`, {
        recipient: { id: senderId },
        message: {
          attachment: {
            type: "audio",
            payload: {
              url: ttsUrl,
              is_reusable: true
            }
          }
        }
      });

      return;
    } catch (error) {
      console.error("TTS Error:", error.message);
      return "❌ | Failed to generate voice message.";
    }
  }
};
