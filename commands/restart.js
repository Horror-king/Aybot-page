module.exports = {
    name: 'restart',
    description: 'Restarts the bot application. Requires a process manager like PM2 to auto-relaunch. Usage: -restart',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage) {
        try {
            await sendFacebookMessage(senderId, `🔄 Restarting bot... Please wait a moment.`, pageAccessToken);

            // Give Messenger a moment to send the above message before exiting
            setTimeout(() => {
                console.log('Bot is initiating restart...');
                // Exit the Node.js process.
                // A process manager (like PM2) configured to keep the app running
                // will automatically relaunch it after this exit.
                process.exit(0);
            }, 1000); // 1 second delay

            return true; // Indicate that message was sent

        } catch (error) {
            console.error('Error in restart command:', error);
            return await sendFacebookMessage(senderId, `❌ Failed to initiate restart: ${error.message}`, pageAccessToken);
        }
    },
};