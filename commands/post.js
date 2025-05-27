const axios = require('axios');

module.exports = {
    name: 'post',
    description: 'Posts a message to the Facebook Page. Usage: -post <Your message here>',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage, loadCommands, PREFIX) {
        if (args.length === 0) {
            return await sendFacebookMessage(senderId, `Usage: ${PREFIX}post <Your message here>`, pageAccessToken);
        }

        const messageToPost = args.join(' '); // Join all arguments to form the complete message

        try {
            // Make the API call to Facebook Graph API to post a message
            const response = await axios.post(
                `https://graph.facebook.com/v19.0/me/feed`, // 'me/feed' posts to the page's timeline
                {
                    message: messageToPost
                },
                {
                    params: { access_token: pageAccessToken },
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            // Log the successful post
            console.log(`✅ Successfully posted to Page (Post ID: ${response.data.id}): "${messageToPost.substring(0, 50)}..."`);

            return await sendFacebookMessage(senderId, `✅ Successfully posted to the page! Post ID: ${response.data.id}`, pageAccessToken);

        } catch (error) {
            console.error('❌ Error posting to Facebook Page:', error.response?.data?.error?.message || error.message);

            let errorMessage = `❌ Failed to post to page.`;
            if (error.response?.data?.error?.message) {
                errorMessage += ` Error: ${error.response.data.error.message}`;
            } else {
                errorMessage += ` Details: ${error.message}`;
            }

            // Truncate error message if too long
            const MAX_ERROR_LENGTH = 500;
            if (errorMessage.length > MAX_ERROR_LENGTH) {
                errorMessage = errorMessage.substring(0, MAX_ERROR_LENGTH - 3) + "...";
            }

            return await sendFacebookMessage(senderId, errorMessage, pageAccessToken);
        }
    },
};