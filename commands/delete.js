const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'delete',
    description: 'Deletes a command file. Usage: -delete <commandName.js>',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage, loadCommands, PREFIX) {
        if (args.length !== 1) {
            return await sendFacebookMessage(senderId, `Usage: ${PREFIX}delete <commandName.js>`, pageAccessToken);
        }

        const fileName = args[0];

        if (!fileName.endsWith('.js')) {
            return await sendFacebookMessage(senderId, `Invalid file name. Please ensure it ends with '.js' (e.g., 'mycommand.js').`, pageAccessToken);
        }

        const commandFilePath = path.join(__dirname, fileName);
        const commandName = fileName.slice(0, -3).toLowerCase(); // For confirmation message

        try {
            // Check if the file exists before attempting to delete
            if (!fs.existsSync(commandFilePath)) {
                return await sendFacebookMessage(senderId, `❌ Command file '${fileName}' not found.`, pageAccessToken);
            }

            // Prevent deleting essential commands (like delete, install, help, load, restart)
            const protectedCommands = ['delete.js', 'install.js', 'help.js', 'load.js', 'restart.js'];
            if (protectedCommands.includes(fileName.toLowerCase())) {
                return await sendFacebookMessage(senderId, `⛔️ Cannot delete essential command '${fileName}'.`, pageAccessToken);
            }

            fs.unlinkSync(commandFilePath); // Delete the file

            // Reload all commands to remove the deleted one from memory
            if (typeof loadCommands === 'function') {
                loadCommands();
            } else {
                console.warn("loadCommands function not passed to delete command.");
            }

            return await sendFacebookMessage(senderId, `✅ Command '${commandName}' (file: ${fileName}) deleted successfully!`, pageAccessToken);
        } catch (error) {
            console.error(`Error deleting command ${fileName}:`, error);
            return await sendFacebookMessage(senderId, `❌ Failed to delete command '${fileName}'. Error: ${error.message}`, pageAccessToken);
        }
    },
};