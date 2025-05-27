module.exports = {
    name: 'load',
    description: 'Reloads all commands. Useful after manual edits or installations. Usage: -load',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage, loadCommands, PREFIX) {
        try {
            if (typeof loadCommands === 'function') {
                loadCommands(); // This will clear cache and reload all commands
                return await sendFacebookMessage(senderId, `✅ All commands reloaded successfully!`, pageAccessToken);
            } else {
                console.error("loadCommands function not available for -load command.");
                return await sendFacebookMessage(senderId, `❌ Error: Command reload function not accessible.`, pageAccessToken);
            }
        } catch (error) {
            console.error("Error during -load command execution:", error);
            return await sendFacebookMessage(senderId, `❌ Failed to reload commands: ${error.message}`, pageAccessToken);
        }
    },
};