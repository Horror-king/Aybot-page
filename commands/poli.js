// commands/poli.js
// Author: Hassan

const axios = require('axios');

module.exports = {
    name: 'poli',
    description: 'Generates an AI image using Pollinations.ai (e.g. bees pollinating flowers).',
    async execute(senderId, args, pageAccessToken) {
        try {
            const userPrompt = args.length > 0 ? args.join(' ') : 'bee pollinating a flower';
            const fullPrompt = `realistic ${userPrompt}`;
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}.jpg`;

            // Send the image to Messenger
            await axios.post(
                `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
                {
                    recipient: { id: senderId },
                    message: {
                        attachment: {
                            type: 'image',
                            payload: {
                                url: imageUrl,
                                is_reusable: true
                            }
                        }
                    }
                }
            );

            return `Here’s your AI-generated image of: ${userPrompt}`;

        } catch (error) {
            console.error('Pollinations command error:', error.message);
            return "Sorry, I couldn't generate the image right now.";
        }
    },
};
