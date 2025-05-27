// commands/fastgen.js
// Author: Allou Mohamed & Hassan (Styled by Hassan)

const axios = require("axios");

module.exports = {
  name: "fastgen",
  description: "Generates up to 4 AI images based on a prompt using AI4Chat.",
  async execute(senderId, args, pageAccessToken) {
    let prompt = args.join(" ").trim();

    if (!prompt) {
      return "⚠️ Please provide a prompt. Example:\n-fastgen a futuristic city --ar 1:1";
    }

    // Extract optional aspect ratio
    let aspectRatio = "16:9";
    const match = prompt.match(/--ar\s*(\d+:\d+)/);
    if (match) {
      aspectRatio = match[1];
      prompt = prompt.replace(/--ar\s*\d+:\d+/, "").trim();
    }

    try {
      // 1. Send "Generating..." message
      await axios.post(
        `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
        {
          recipient: { id: senderId },
          message: { text: `🧠 Generating images for: "${prompt}"\nPlease wait...` }
        }
      );

      // 2. Wait for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      const images = [];

      // 3. Generate up to 4 images
      for (let i = 0; i < 4; i++) {
        const res = await axios.get(`https://www.ai4chat.co/api/image/generate?prompt=${encodeURIComponent(prompt)}&aspect_ratio=${encodeURIComponent(aspectRatio)}`);
        if (res.data.image_link) {
          images.push(res.data.image_link);
        }
      }

      if (!images.length) {
        return "❌ Sorry, no images were generated. Please try again.";
      }

      // 4. Send each image to the user
      for (const url of images) {
        await axios.post(
          `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
          {
            recipient: { id: senderId },
            message: {
              attachment: {
                type: "image",
                payload: {
                  url,
                  is_reusable: true
                }
              }
            }
          }
        );
      }

      return `✅ Done! Here are your images for: "${prompt}"`;

    } catch (error) {
      console.error("FastGen error:", error.message);
      return "❌ Something went wrong while generating the images.";
    }
  }
};
