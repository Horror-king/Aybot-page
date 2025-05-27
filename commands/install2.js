// ... (previous content of install.js - no changes from last provided version)

module.exports = {
    name: 'install2',
    description: 'Installs a new command from a raw Pastebin URL. Usage: -install <fileName.js> <rawPastebinURL>',
    async execute(senderId, args, pageAccessToken, sendFacebookMessage, loadCommands, PREFIX) { // Added sendFacebookMessage, loadCommands, PREFIX
        if (args.length !== 2) {
            return await sendFacebookMessage(senderId, `Usage: ${PREFIX}install <fileName.js> <rawPastebinURL>`, pageAccessToken);
        }

        const fileName = args[0];
        const pastebinUrl = args[1];

        if (!fileName.endsWith('.js')) {
            return await sendFacebookMessage(senderId, `Invalid file name. Please ensure it ends with '.js' (e.g., 'mycommand.js').`, pageAccessToken);
        }

        const commandName = fileName.slice(0, -3).toLowerCase();

        if (!pastebinUrl.startsWith('https://pastebin.com/raw/')) {
            return await sendFacebookMessage(senderId, `Invalid Pastebin URL. Please use a raw Pastebin URL (e.g., https://pastebin.com/raw/5hQfs1Bw).`, pageAccessToken);
        }

        try {
            const response = await axios.get(pastebinUrl);
            const commandCode = response.data;

            const commandFilePath = path.join(__dirname, fileName);
            fs.writeFileSync(commandFilePath, commandCode);

            // This is the crucial part that reloads commands automatically
            if (typeof loadCommands === 'function') {
                loadCommands();
            } else {
                console.warn("loadCommands function not passed to install command.");
            }

            return await sendFacebookMessage(senderId, `Command '${commandName}' (file: ${fileName}) installed successfully! Try \`${PREFIX}help\` to see it.`, pageAccessToken);
        } catch (error) {
            console.error(`Error installing command ${fileName}:`, error);
            return await sendFacebookMessage(senderId, `Failed to install command '${fileName}'. Error: ${error.message}`, pageAccessToken);
        }
    },
};