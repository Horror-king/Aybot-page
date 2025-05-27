const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

module.exports = {
    name: 'image',
    description: 'Generate images using Stable Horde and send to Messenger. Usage: -image [prompt]',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage, loadCommands, PREFIX) {
        if (args.length === 0) {
            let message = `Usage: ${PREFIX}image [prompt]. Example: ${PREFIX}image A dragon flying over mountains.`;
            return await sendFacebookMessage(senderId, message, pageAccessToken);
        }

        const prompt = args.join(' ');
        const stableHordeApiKey = 'fxwOs-YCMqWiyEyCfL2ElA';
        const apiUrl = 'https://stablehorde.net/api/v2/generate/async';

        try {
            await sendFacebookMessage(senderId, `🔄 Generating image for "${prompt}"... Please wait.`, pageAccessToken);

            const generationRequest = await axios.post(apiUrl, {
                prompt: prompt,
                params: { n: 1 },
                models: ["stable_diffusion", "stable_diffusion_xl"],
                shared: true,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': stableHordeApiKey,
                },
            });

            const { id: generationId } = generationRequest.data;

            const pollForResult = async () => {
                return new Promise((resolve, reject) => {
                    const interval = setInterval(async () => {
                        const status = await axios.get(`https://stablehorde.net/api/v2/generate/check/${generationId}`, {
                            headers: { 'apikey': stableHordeApiKey },
                        });

                        if (status.data.done) {
                            clearInterval(interval);
                            const result = await axios.get(`https://stablehorde.net/api/v2/generate/status/${generationId}`, {
                                headers: { 'apikey': stableHordeApiKey },
                            });
                            resolve(result.data.generations[0]?.img || null);
                        }
                    }, 5000);
                });
            };

            const imageUrl = await pollForResult();

            if (!imageUrl) {
                return await sendFacebookMessage(senderId, `❌ Image generation failed. No image URL returned.`, pageAccessToken);
            }

            // Download image to temp file
            const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
            const tempImagePath = path.join(__dirname, 'temp_image.jpg');
            const writer = fs.createWriteStream(tempImagePath);

            imageResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Upload image to Facebook to get attachment_id
            const form = new FormData();
            form.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: true } } }));
            form.append('filedata', fs.createReadStream(tempImagePath));

            const uploadRes = await axios.post(`https://graph.facebook.com/v19.0/me/message_attachments?access_token=${pageAccessToken}`, form, {
                headers: form.getHeaders(),
            });

            const attachmentId = uploadRes.data.attachment_id;

            // Send image message
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
                recipient: { id: senderId },
                message: {
                    attachment: {
                        type: 'image',
                        payload: { attachment_id: attachmentId }
                    }
                }
            });

            fs.unlinkSync(tempImagePath); // Delete temp file

        } catch (error) {
            console.error('Image command error:', error.message);
            return await sendFacebookMessage(senderId, `❌ Error: ${error.message}`, pageAccessToken);
        }
    },
};