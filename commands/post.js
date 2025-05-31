const axios = require('axios');

module.exports = {
    name: 'post',
    description: 'Posts a message to the Facebook Page. Usage: -post <Your message here>',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage) {
        // Access ADMIN_UIDS and PREFIX from the main index.js file
        const { ADMIN_UIDS, PREFIX } = require('../index');

        // --- Admin check ---
        if (!ADMIN_UIDS.includes(senderId)) {
            return await sendFacebookMessage(senderId, `🚫 You're not authorized to use this command. Only administrators can post messages to the page.`, pageAccessToken);
        }
        // --- End of Admin check ---

        if (args.length === 0) {
            return await sendFacebookMessage(senderId, `Usage: ${PREFIX}post <Your message here>`, pageAccessToken);
        }

        const messageToPost = args.join(' '); // Combine all arguments into a single message

        try {
            // Make the API call to Facebook Graph API to post a message to the page's feed
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

            // Log the successful post to your server console
            console.log(`✅ Successfully posted to Page (Post ID: ${response.data.id}): "${messageToPost.substring(0, 50)}..."`);

            // Send a confirmation message back to the sender
            return await sendFacebookMessage(senderId, `✅ Successfully posted to the page! Post ID: ${response.data.id}`, pageAccessToken);

        } catch (error) {
            // Log the detailed error to your server console
            console.error('❌ Error posting to Facebook Page:', error.response?.data?.error?.message || error.message);

            // Prepare a user-friendly error message
            let errorMessage = `❌ Failed to post to the page.`;
            if (error.response?.data?.error?.message) {
                errorMessage += ` Error: ${error.response.data.error.message}`;
            } else {
                errorMessage += ` Details: ${error.message}`;
            }

            // Truncate error message if it's too long for Facebook Messenger
            const MAX_ERROR_LENGTH = 500;
            if (errorMessage.length > MAX_ERROR_LENGTH) {
                errorMessage = errorMessage.substring(0, MAX_ERROR_LENGTH - 3) + "...";
            }

            // Send the error message back to the sender
            return await sendFacebookMessage(senderId, errorMessage, pageAccessToken);
        }
    },
};
