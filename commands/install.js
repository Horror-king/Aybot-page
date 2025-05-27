const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = {
    name: 'install',
    description: 'Installs a new command from a raw Pastebin URL. Usage: -install <fileName.js> <rawPastebinURL>',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage, loadCommands) {
        if (args.length !== 2) {
            return await sendFacebookMessage(senderId, `Usage: ${require('../index').PREFIX}install <fileName.js> <rawPastebinURL>`, pageAccessToken);
        }

        const fileName = args[0]; // e.g., "imgbb.js"
        const pastebinUrl = args[1];

        if (!fileName.endsWith('.js')) {
            return await sendFacebookMessage(senderId, `Invalid file name. Please ensure it ends with '.js' (e.g., 'mycommand.js').`, pageAccessToken);
        }

        const commandName = fileName.slice(0, -3).toLowerCase(); // Remove .js and convert to lowercase for command name

        // Basic validation for pastebin URL format
        if (!pastebinUrl.startsWith('https://pastebin.com/raw/')) {
            return await sendFacebookMessage(senderId, `Invalid Pastebin URL. Please use a raw Pastebin URL (e.g., https://pastebin.com/raw/5hQfs1Bw).`, pageAccessToken);
        }

        try {
            const response = await axios.get(pastebinUrl);
            const commandCode = response.data;

            const commandFilePath = path.join(__dirname, fileName);
            fs.writeFileSync(commandFilePath, commandCode);

            // Reload all commands to include the new one
            loadCommands();

            return await sendFacebookMessage(senderId, `Command '${commandName}' (file: ${fileName}) installed successfully! Try \`${require('../index').PREFIX}help\` to see it.`, pageAccessToken);
        } catch (error) {
            console.error(`Error installing command ${fileName}:`, error);
            return await sendFacebookMessage(senderId, `Failed to install command '${fileName}'. Error: ${error.message}`, pageAccessToken);
        }
    },
};